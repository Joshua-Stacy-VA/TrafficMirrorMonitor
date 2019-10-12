'use strict';

const pcap = require('pcap');
const uuid = require('uuid/v4');
const chalk = require('chalk');

const VXLAN_PCAP_FILTER = 'udp port 4789';

class Capture {
    constructor(options) {
        const {
            log, device, sessions, filter = VXLAN_PCAP_FILTER,
        } = options;

        Object.assign(this, {
            log,
            sessions,
            streams: new Map(),
            onPacketCapture: this.onPacketCapture.bind(this),
        });

        this.log.info(`Capture listening on device ${device}, filtering packets with "${filter}"`);
        Object.assign(this, {
            tcpTracker: new pcap.TCPTracker(),
            listener: pcap.createSession(device, filter),
        });

        this.listener.on('packet', this.onPacketCapture);
    }

    // Packets here should contain the following structure:
    //    Ethernet => IPv4 => UDP => VxLAN => Ethernet => IPv4 => TCP => $$
    onPacketCapture(rawPacket) {
        // Decode the raw PCAP packet down to the UDP level of the VxLAN encapsulation, silently failing if
        const packet = pcap.decode.packet(rawPacket);
        const udpPacket = Capture.getPayloadRecursive(packet, 3);

        // Silently fail if this not a UDP packet.
        if (!udpPacket) {
            return;
        }


        // Parse the VxLAN header (in the future, we'll verify the VxLAN header flags and VNI value)
        const { data } = udpPacket;
        let offset = 0;

        /* eslint-disable */
        const flags = data.readUInt8(offset, true) & 0x08;
        offset += 4;
        const vni = (data.readUInt32BE(offset, true) & 0xFFFFFF00) >> 8;

        this.log.silly(`VxLAN Header VNI: ${vni}, Flags: ${flags}`);
        /* eslint-enable */


        // Build a PCAP packet with header to allow us to leverage the PCAP library decoder. We want to get down
        // to the TCP level to take advantage of the built-in TCP stream tracker
        const vxlanBuffer = data.slice(8);
        const vxlanHeader = Buffer.from(rawPacket.header);
        vxlanHeader.writeUInt32LE(vxlanBuffer.length, 8);
        vxlanHeader.writeUInt32LE(vxlanBuffer.length, 12);

        const vxlanPacket = pcap.decode.packet({
            buf: vxlanBuffer,
            header: vxlanHeader,
            link_type: 'LINKTYPE_ETHERNET',
        });

        this.trackPacket(vxlanPacket);
    }

    trackPacket(packet) {
        const ip = Capture.getPayloadRecursive(packet, 2);
        if (!ip) {
            return;
        }

        const { payload: tcp, saddr, daddr } = ip;
        const { sport, dport } = tcp;
        const src = `${saddr}:${sport}`;
        const dst = `${daddr}:${dport}`;

        const key = (src < dst) ? `${src}-${dst}` : `${dst}-${src}`;
        this.getTCPStream(key, { src, dst }).track(packet);
    }

    getTCPStream(key, options) {
        if (!this.streams.has(key)) {
            this.streams.set(key, this.createTCPStream(key, options));
        }

        const { stream } = this.streams.get(key);
        return stream;
    }

    createTCPStream(key, options) {
        const streamId = uuid();
        const [shortId] = streamId.split('-');

        const { src, dst } = options;
        const streamDescription = chalk.bold(`${src} => ${dst}`);
        this.log.info(`TCP stream ${chalk.bold(shortId)} ${chalk.green('OPENED')} (${streamDescription})`);

        const stream = new pcap.TCPSession();
        const session = this.sessions.create(streamId, {
            client: src,
            target: dst,
        });
        session.open();

        stream
            .on('data send', (streamObj, data) => {
                this.log.debug(`[${shortId}] CLIENT: ${src} => ${dst} ${data.toString().slice(0, 15)}`);
                session.clientData(data);
            })
            .on('data recv', (streamObj, data) => {
                this.log.debug(`[${shortId}] TARGET: ${dst} => ${src} ${data.toString().slice(0, 15)}`);
                session.targetData(data);
            })
            .on('end', (streamObj) => {
                this.log.info(`TCP stream ${chalk.bold(shortId)} ${chalk.yellow('CLOSED')} (${streamDescription})`);
                console.log(streamObj.state);
                session.close();
                this.deleteTCPStream(key);
            });

        return {
            id: streamId,
            stream,
            session,
        };
    }

    deleteTCPStream(key) {
        const streamObj = this.streams.get(key);
        if (!streamObj) {
            return;
        }

        const { id } = streamObj;

        Object.assign(streamObj, { stream: null, session: null });

        this.sessions.delete(id);
        // this.streams.delete(key);
    }

    static getPayloadRecursive(packet = {}, levels = 0) {
        if (!packet || levels === 0) {
            return packet;
        }
        const { payload = null } = packet;
        return Capture.getPayloadRecursive(payload, levels - 1);
    }

    static createCapture(system) {
        const { Configuration, Logger, Sessions } = system;
        const log = Logger.getLogger();

        const { capture } = Configuration.get();
        const { device } = capture;

        const captureInstance = new Capture({ log, device, sessions: Sessions });
        return captureInstance;
    }
}

module.exports = { Capture };
