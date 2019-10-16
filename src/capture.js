'use strict';

const pcap = require('pcap');
const uuid = require('uuid/v4');
const chalk = require('chalk');

const VXLAN_PCAP_FILTER = 'udp port 4789';

// ==================================================== TCP Stream =====================================================
class TCPStream {
    constructor(options) {
        const streamId = uuid();
        const [shortId] = streamId.split('-');

        const { src, dst } = options;
        const description = chalk.bold(`${src} => ${dst}`);

        const stream = new pcap.TCPSession();

        Object.assign(this, {
            streamId,
            shortId,
            description,
            stream,
            ...options,
        });
    }

    open() {
        const {
            src, dst, streamId, shortId, description, log, store, stream,
        } = this;

        log.info(`TCP stream ${chalk.bold(shortId)} ${chalk.green('OPENED')} (${description})`);

        store.open(streamId, { client: src, target: dst });

        stream
            .on('data send', (_, data) => {
                log.debug(`[${shortId}] CLIENT: ${src} => ${dst} ${data.toString().slice(0, 15)}`);
                store.clientData(data);
            })
            .on('data recv', (_, data) => {
                log.debug(`[${shortId}] TARGET: ${dst} => ${src} ${data.toString().slice(0, 15)}`);
                store.targetData(data);
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

        const {
            shortId, description, log, session, stream,
        } = this;

        log.info(`TCP stream ${chalk.bold(shortId)} ${chalk.yellow('CLOSED')} (${description})`);
        session.close();
        stream.removeAllListeners();

        Object.assign(this, {
            session: null,
            stream: null,
        });
    }

    track(packet) {
        if (this.isClosed || !this.stream) {
            return;
        }
        this.stream.track(packet);
    }

    static createKey(src, dst) {
        return (src < dst) ? `${src}-${dst}` : `${dst}-${src}`;
    }
}

// ================================================ TCP Stream Manager =================================================
class TCPStreamManager extends Map {
    constructor({ log, store }) {
        super();
        Object.assign(this, { log, store });
    }

    getStream(src, dst) {
        const key = TCPStream.createKey(src, dst);
        if (!this.has(key)) {
            const { log, store } = this;
            const stream = new TCPStream({
                src, dst, store, log,
            });

            stream.open();
            this.set(key, stream);
        }

        return this.get(key);
    }

    deleteStream(key) {
        const stream = this.get(key);
        if (!stream) {
            return;
        }

        stream.close();
        this.delete(key);
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

        const stream = this.streams.getStream(src, dst);
        stream.track(packet);
    }

    static getPayloadRecursive(packet = {}, levels = 0) {
        if (!packet || levels === 0) {
            return packet;
        }
        const { payload = null } = packet;
        return Capture.getPayloadRecursive(payload, levels - 1);
    }

    static createCapture(system) {
        const { Configuration, Logger, Store } = system;
        const log = Logger.getLogger();

        const { capture } = Configuration.get();
        const { device } = capture;

        const captureInstance = new Capture({ log, device, store: Store });
        return captureInstance;
    }
}

module.exports = { Capture };
