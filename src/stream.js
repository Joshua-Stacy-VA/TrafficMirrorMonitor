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
    constructor({ log, store, delay = 500 }) {
        super();
        Object.assign(this, { log, store, delay });
    }

    getStream(src, dst) {
        const key = TCPStreamManager.createKey(src, dst);
        if (!this.has(key)) {
            const stream = this.createStream(src, dst, key);
            this.set(key, stream);
        }

        return this.get(key);
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
