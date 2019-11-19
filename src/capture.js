'use strict';

const dgram = require('dgram');
const net = require('net');
const pcap = require('pcap');
const chalk = require('chalk');
const { TCPStreamManager } = require('./stream');

// ================================================== Capture Service ==================================================
class Capture {
    constructor(options) {
        const {
            log,
            store,
            port = 4789,
            healthCheckPort = 14789,
        } = options;

        Object.assign(this, {
            log,
            store,
            port,
            healthCheckPort,
            streams: new TCPStreamManager({ log, store }),
            tcpTracker: new pcap.TCPTracker(),
            onPacketCapture: this.onPacketCapture.bind(this),
            onServerReady: this.onServerReady.bind(this),
            onServerShutdown: this.onServerShutdown.bind(this),
            server: dgram.createSocket('udp4'),
            healthCheckServer: net.createServer(),
        });

        this.healthCheckServer.listen(healthCheckPort, () => {
            this.log.info(`Health check listening on TCP port ${chalk.bold(healthCheckPort)}`);
        });

        this.server
            .on('listening', this.onServerReady)
            .on('message', this.onPacketCapture)
            .on('error', this.onServerShutdown)
            .on('close', this.onServerShutdown)
            .bind(port);
    }

    onServerReady() {
        const { port } = this;
        this.log.info(`Capture listening for UDP packets on ${chalk.bold(port)}`);
    }

    // If the UDP server socket closes or throws an error, we shut down the health check server to trigger any
    // watchers that this instance is in trouble.
    onServerShutdown() {
        this.log.info(`UDP server socket shutting down, closing health check TCP port ${chalk.bold(this.healthCheckPort)}`);
        this.healthCheckServer.close();
    }

    // UDP packet data here should contain the following structure:
    //    UDP => VxLAN => Ethernet => IPv4 => TCP => $$
    onPacketCapture(data) {
        // Parse the VxLAN header out of the UDP packet paylod.
        // (Note: In the future, we'll verify the VxLAN header flags and VNI value)
        let offset = 0;

        /* eslint-disable */
        const flags = data.readUInt8(offset, true) & 0x08;
        offset += 4;
        const vni = (data.readUInt32BE(offset, true) & 0xFFFFFF00) >> 8;

        this.log.silly(`VxLAN Header VNI: ${vni}, Flags: ${flags}`);
        /* eslint-enable */


        // Build a PCAP packet with header to allow us to leverage the PCAP library decoder. We want to get down
        // to the TCP level to take advantage of the built-in TCP stream tracker. To do that, we need to coerce the
        // tracker to handle the data parsed out of the VxLAN packet by constructing a PCAP header to pass along
        // with the data.
        const vxlanBuffer = data.slice(8);
        const vxlanHeader = Buffer.alloc(16);
        const timestamp = Date.now();
        vxlanHeader.writeUInt32LE(Math.round(timestamp / 1000), 0);
        vxlanHeader.writeUInt32LE(Math.round((timestamp % 1000) * 1000), 4);
        vxlanHeader.writeUInt32LE(vxlanBuffer.length, 8);
        vxlanHeader.writeUInt32LE(vxlanBuffer.length, 12);

        const vxlanPacket = pcap.decode.packet({
            buf: vxlanBuffer,
            header: vxlanHeader,
            link_type: 'LINKTYPE_ETHERNET',
        });

        const ip = Capture.getPayloadRecursive(vxlanPacket, 2);
        if (!ip) {
            return;
        }

        const { payload: tcp, saddr, daddr } = ip;
        const { sport, dport, flags: tcpFlags } = tcp;
        const src = `${saddr}:${sport}`;
        const dst = `${daddr}:${dport}`;

        const stream = this.streams.getStream(src, dst, tcpFlags);
        if (stream) {
            stream.track(vxlanPacket);
        }
    }

    static getPayloadRecursive(packet = {}, levels = 0) {
        if (!packet || levels === 0) {
            return packet;
        }
        const { payload = null } = packet;
        return Capture.getPayloadRecursive(payload, levels - 1);
    }

    /**
     * Static class factory method, used for BottleJS dependency injection
     * @param  {Bottle} system BottleJS interface object
     * @return {Capture}
     *
     * See {@link https://github.com/young-steveo/bottlejs|BottleJS on GitHub} for more info on BottleJS
     */
    static create(system) {
        const { Configuration, Logger, Store } = system;
        const log = Logger.getLogger();

        const { capture = {} } = Configuration.get();
        const { port = 4789 } = capture;

        const captureInstance = new Capture({ log, port, store: Store });
        return captureInstance;
    }
}

module.exports = { Capture };
