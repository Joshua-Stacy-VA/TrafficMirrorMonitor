'use strict';

const EventEmitter = require('events');
const pcap = require('pcap');
const uuid = require('uuid/v4');
const chalk = require('chalk');

const VXLAN_PCAP_FILTER = 'udp port 4789';

// ==================================================== TCP Stream =====================================================
class TCPStream extends EventEmitter {
    constructor(streamId) {
        super();
        const [shortId] = streamId.split('-');
        const stream = new pcap.TCPSession();

        Object.assign(this, {
            id: streamId,
            shortId,
            stream,
            isClosed: false,
        });

        stream
            .on('data send', (_, data) => {
                this.emit('CLIENT', data);
            })
            .on('data recv', (_, data) => {
                this.emit('TARGET', data);
            })
            .on('end', () => {
                this.close();
            });
    }

    close() {
        if (this.isClosed) {
            return;
        }

        this.isClosed = true;
        this.emit('CLOSE');

        this.removeAllListeners();
        this.stream.removeAllListeners();

        Object.assign(this, { stream: null });
    }

    track(packet) {
        if (this.isClosed || !this.stream) {
            return;
        }
        this.stream.track(packet);
    }
}

// ================================================ TCP Stream Manager =================================================
class TCPStreamManager extends Map {
    constructor({ log, store }) {
        super();
        Object.assign(this, { log, store });
    }

    getStream(src, dst) {
        const key = TCPStreamManager.createKey(src, dst);
        if (!this.has(key)) {
            const stream = this.createStream(src, dst);
            this.set(key, stream);
        }

        return this.get(key);
    }

    createStream(src, dst) {
        const { store, log } = this;

        const id = uuid();

        const stream = new TCPStream(id);

        const { shortId } = stream;
        const streamId = chalk.bold(shortId);
        const fromClient = chalk.bold(`${src} => ${dst}`);
        const fromTarget = chalk.bold(`${src} => ${dst}`);

        log.info(`TCP stream ${streamId} ${chalk.green('OPENED')} (${fromClient})`);
        store.open(id, { client: src, target: dst });

        stream
            .on('CLIENT', (data) => {
                log.debug(`[${streamId}] CLIENT (${fromClient}) ${data.length} bytes`);
                store.clientData(id, data);
            })
            .on('TARGET', (data) => {
                log.debug(`[${streamId}] TARGET (${fromTarget}) ${data.length} bytes`);
                store.targetData(id, data);
            })
            .on('CLOSE', () => {
                store.close(id);
                log.info(`TCP stream ${streamId} ${chalk.yellow('CLOSED')} (${fromClient})`);
            });

        return stream;
    }

    deleteStream(key) {
        const stream = this.get(key);
        if (!stream) {
            return;
        }

        stream.close();
        stream.removeAllListeners();

        this.delete(key);
    }

    static createKey(src, dst) {
        return (src < dst) ? `${src}-${dst}` : `${dst}-${src}`;
    }
}

// ================================================== Capture Service ==================================================
class Capture {
    constructor(options) {
        const {
            log, device, store, filter = VXLAN_PCAP_FILTER,
        } = options;

        Object.assign(this, {
            log,
            store,
            streams: new TCPStreamManager({ log, store }),
            onPacketCapture: this.onPacketCapture.bind(this),
        });

        this.log.info(`Capture listening on device ${chalk.bold(device)}, filtering packets with "${chalk.bold(filter)}"`);
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

        const ip = Capture.getPayloadRecursive(vxlanPacket, 2);
        if (!ip) {
            return;
        }

        const { payload: tcp, saddr, daddr } = ip;
        const { sport, dport } = tcp;
        const src = `${saddr}:${sport}`;
        const dst = `${daddr}:${dport}`;

        const stream = this.streams.getStream(src, dst);
        stream.track(vxlanPacket);
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

        const { capture } = Configuration.get();
        const { device } = capture;

        const captureInstance = new Capture({ log, device, store: Store });
        return captureInstance;
    }
}

module.exports = { Capture };
