'use strict';

const EventEmitter = require('events');
const pcap = require('pcap');
const uuid = require('uuid/v4');
const chalk = require('chalk');

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
            .on('syn retry', () => {
                this.emit('SYN_RETRY');
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

    adjust(src, dst) {
        Object.assign(this.stream, {
            src,
            dst,
            src_name: src,
            dst_name: dst,
        });
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
    constructor({ log, store, delay = 500 }) {
        super();
        Object.assign(this, { log, store, delay });
    }

    getStream(src, dst, flags) {
        const key = TCPStreamManager.createKey(src, dst);
        if (this.has(key)) {
            return this.get(key);
        }

        // If we're here, we're creating a new TCP stream. We make sure that we're actually creating
        // the stream properly with the correct source and destination fields
        const { syn = false, ack = false } = flags;
        if (!syn) {
            return null;
        }

        // We make sure that we have the client and target straight, based on the TCP connect handshake flags.
        const client = ack ? dst : src;
        const target = ack ? src : dst;

        // Create the stream, then adjust the strea
        const stream = this.createStream(client, target, key);

        this.set(key, stream);
        return stream;
    }

    createStream(src, dst, key) {
        const { store, log, delay } = this;

        const id = uuid();

        const stream = new TCPStream(id);

        const { shortId } = stream;
        const streamId = chalk.bold(shortId);
        const fromClient = chalk.bold(`${src} => ${dst}`);
        const fromTarget = chalk.bold(`${dst} => ${src}`);

        log.info(`[${streamId}] TCP Stream ${chalk.green('OPENED')} (${fromClient})`);
        store.open(id, { client: src, target: dst });

        stream
            .on('CLIENT', (data) => {
                log.debug(`[${streamId}] CLIENT (${fromClient}) ${chalk.green(data.length)} bytes`);
                store.clientData(id, data);
            })
            .on('TARGET', (data) => {
                log.debug(`[${streamId}] TARGET (${fromTarget}) ${chalk.green(data.length)} bytes`);
                store.targetData(id, data);
            })
            .on('SYN_RETRY', () => {
                log.verbose(`[${streamId}] received a SYN RETRY event; adjusting stream object...`);
                stream.adjust(src, dst);
            })
            .on('CLOSE', () => {
                store.close(id);
                log.info(`[${streamId}] TCP stream ${chalk.yellow('CLOSED')} (${fromClient})`);

                // Delay the actual removal of the stream, since we may receive the dying ember packets of this stream
                setTimeout(() => this.deleteStream(key), delay);
            });

        return stream;
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
