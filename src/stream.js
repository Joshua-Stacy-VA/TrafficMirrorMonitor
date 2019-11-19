'use strict';

const EventEmitter = require('events');
const pcap = require('pcap');
const uuid = require('uuid/v4');
const chalk = require('chalk');

// ==================================================== TCP Stream =====================================================
class TCPStream extends EventEmitter {
    constructor(streamId, { log, store }) {
        super();
        const [shortId] = streamId.split('-');
        const stream = new pcap.TCPSession();

        Object.assign(this, {
            id: streamId,
            shortId,
            stream,
            log,
            store,
            isClosed: false,
            isConnected: false,
            queue: [],
        });
    }

    connect(src, dst) {
        const { shortId, id } = this;
        const streamId = chalk.bold(shortId);
        const fromClient = chalk.bold(`${src} => ${dst}`);
        const fromTarget = chalk.bold(`${dst} => ${src}`);

        this.log.info(`[${streamId}] TCP Stream ${chalk.green('OPENED')} (${fromClient})`);
        this.store.open(id, { client: src, target: dst });
        this.stream
            .on('data send', (_, data) => {
                this.log.debug(`[${streamId}] CLIENT (${fromClient}) ${chalk.green(data.length)} bytes`);
                this.store.clientData(id, data);
            })
            .on('data recv', (_, data) => {
                this.log.debug(`[${streamId}] TARGET (${fromTarget}) ${chalk.green(data.length)} bytes`);
                this.store.targetData(id, data);
            })
            .on('reset', () => {
                this.log.info(`[${streamId}] TCP stream ${chalk.red('RESET')} (${fromClient})`);
                this.close();
            })
            .on('end', () => {
                this.log.info(`[${streamId}] TCP stream ${chalk.yellow('CLOSED')} (${fromClient})`);
                this.close();
            });

        this.isConnected = true;
    }

    close(source = 'TARGET') {
        if (this.isClosed) {
            return;
        }

        this.isConnected = false;
        this.isClosed = true;
        this.emit('CLOSE');

        this.removeAllListeners();
        this.stream.removeAllListeners();
        this.store.close(this.id, source);

        Object.assign(this, {
            stream: null,
            log: null,
            store: null,
            queue: null,
        });
    }

    track(packet) {
        if (this.isClosed || !this.stream) {
            return;
        }

        const { payload: ip } = packet.payload;
        const { payload: tcp } = ip;
        const { flags } = tcp;
        const { fin = false } = flags;

        // Before anything, We intercept the intent to close the TCP socket by watching the "FIN" flag. Once we
        // see the FIN, we close the stream and clean up all the resources. We also note *who* closed the socket
        // for record-keeping purposes
        if (fin) {
            const { saddr } = ip;
            const { sport } = tcp;
            const src = `${saddr}:${sport}`;

            const { stream = {} } = this.stream;
            const { src: streamSrc = '' } = stream;

            const closeEventSource = (src === streamSrc) ? 'CLIENT' : 'TARGET';
            return this.close(closeEventSource);
        }

        if (this.isConnected) {
            return this.stream.track(packet);
        }

        // If we're not connected yet, we make sure that the packets are in the right order to facilitate a
        // proper TCP 3-way handshake (at least the first 2 parts of the 3-way)
        const { syn = false, ack = false } = flags;

        // Only create the TCP stream tracker (and initialize the stream object) when we get the very first
        // TCP SYN packet. Otherwise, if we receive the packets out of order, we save them. We'll eventually
        // get the TCP SYN packet, since we wouldn't have gotten the mirrored packet in the first place, so
        // this method is relatively safe, resource-wise. Once we get the SYN packet, we flush the queue and
        // assume that everything is okay in a 1, 2, 3-way...
        if (syn && !ack) {
            const { saddr, daddr } = ip;
            const { sport, dport } = tcp;
            const src = `${saddr}:${sport}`;
            const dst = `${daddr}:${dport}`;

            this.connect(src, dst);
            this.track(packet);

            while (this.queue.length > 0) {
                const nextPacket = this.queue.shift();
                this.track(nextPacket);
            }
        } else {
            this.queue.push(packet);
        }
    }
}

// ================================================ TCP Stream Manager =================================================
class TCPStreamManager extends Map {
    constructor({ log, store, delay = 500 }) {
        super();
        Object.assign(this, { log, store, delay });
    }

    getStream(src, dst, flags = {}) {
        const key = TCPStreamManager.createKey(src, dst);
        if (this.has(key)) {
            return this.get(key);
        }

        // We only want to create a stream if the 'SYN' flag is true
        const { syn = false } = flags;
        if (!syn) {
            return null;
        }

        // Create the stream with a hook in for the 'CLOSE' event to clean up the resources
        const stream = this.createStream();
        stream.on('CLOSE', () => {
            this.deleteStream(key);
        });

        this.set(key, stream);
        return stream;
    }

    createStream() {
        const { store, log } = this;
        const id = uuid();

        return new TCPStream(id, { store, log });
    }

    deleteStream(key) {
        const stream = this.get(key);
        if (!stream) {
            return;
        }

        const { shortId } = stream;
        const streamId = chalk.bold(shortId);
        this.log.debug(`[${streamId}] Stream resources removed`);

        stream.close();
        stream.removeAllListeners();

        this.delete(key);
    }

    static createKey(src, dst) {
        return (src < dst) ? `${src}-${dst}` : `${dst}-${src}`;
    }
}

module.exports = { TCPStreamManager, TCPStream };
