'use strict';

const EventEmitter = require('events');
const path = require('path');
const PQueue = require('p-queue');
const fs = require('fs-extra');
const AWS = require('aws-sdk');

class Session extends EventEmitter {
    constructor(id, options) {
        super();

        const { client, target } = options;
        Object.assign(this, {
            id,
            client,
            target,
            isClosed: false,
        });
        this.reset();
    }

    reset() {
        Object.assign(this, {
            payload: {
                client: [],
                target: [],
                control: [],
            },
            count: 0,
            seqeunceId: 0,
        });
    }

    push(source, data) {
        if (this.isClosed) {
            return;
        }

        const { payload } = this;
        const { [source]: list } = payload;

        list.push({
            data,
            timestamp: Date.now(),
            sequenceNumber: this.nextSequenceValue(),
        });

        // Check thresholds, if we're beyond then flush the session
    }

    close() {
        if (this.isClosed) {
            return;
        }

        this.isClosed = true;
        this.emit('CLOSE');

        this.removeAllListeners();

        // TODO: Shutdown timeout listeners
    }

    flush() {
        if (!this.count) {
            return;
        }

        const {
            id, client, target, payload,
        } = this;

        const data = {
            id,
            client,
            target,
            payload,
        };

        this.emit('DATA', data);
        this.reset();
    }

    nextSeqeunceId() {
        this.sequenceId += 1;
        return this.sequenceId.toString().padStart(32, '0');
    }
}

// ================================================ Base Storage Class =================================================
class Store extends Map {
    constructor(options) {
        super();

        const {
            log, threshold = 200, timeout = 6000, ...rest
        } = options;

        Object.assign(this, {
            log,
            threshold,
            timeout,
            queue: new PQueue(),
            ...rest,
        });

        const { type } = this;
        this.StoreClass = Store.classMap[type];
    }

    open(id, options) {
        const { threshold, timeout } = this;

        const session = new Session(id, { threshold, timeout, ...options });
        this.log.debug(`Opening store session ${id}`);

        session
            .on('DATA', (data) => {
                this.queue.add(async () => {
                    const fileName = Store.generateFileName(data);
                    this.log.debug(`Store session ${id} writing ${fileName}...`);
                    await this.write(fileName, data);
                });
            })
            .on('CLOSE', () => {
                this.log.debug(`Closing store session ${id}`);
                session.removeAllListeners();
                this.delete(id);
            });

        this.set(id, session);

        this.push(id, 'control', 'LINK_ESTABLISH');
    }

    close(id) {
        this.push(id, 'control', 'LINK_TEARDOWN');

        const session = this.get(id);
        if (session) {
            session.close();
        }
    }

    clientData(id, data) {
        this.push(id, 'client', data);
    }

    targetData(id, data) {
        this.push(id, 'target', data);
    }

    push(id, source, data) {
        const session = this.get(id);
        if (session) {
            session.push(source, data);
        }
    }

    static generateFileName(data) {
        const { id = 'UNKNOWN' } = data;
        return `${Date.now()}_${id}.json`;
    }

    static createStore(system) {
        const { Configuration, Logger } = system;
        const log = Logger.getLogger();

        const { store } = Configuration.get();
        const { type, options } = store;
        const StoreClass = Store.classMap[type];

        const storeInstance = new StoreClass({ log, ...options });
        return storeInstance;
    }
}

Store.classMap = {};

// ============================================= File-based Local Storage ==============================================
class LocalStore extends Store {
    constructor(options) {
        super(options);

        const { baseDir = '.' } = options;
        Object.assign(this, {
            baseDir,
        });

        fs.ensureDirSync(baseDir);
    }

    async write(fileName, data) {
        await fs.writeJson(path.join(this.baseDir, fileName), data, { spaces: 2 });
    }
}

Store.classMap.local = LocalStore;

// ================================================== AWS S3 Storage ===================================================
class S3Store extends Store {
    constructor(options) {
        super(options);

        const { region, bucket } = options;
        Object.assign(this, {
            s3: new AWS.S3({ region }),
            bucket,
        });
    }

    async write(fileName, data) {
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: fileName,
            Body: JSON.stringify(data, null, 2),
        }).promise();
    }
}

Store.classMap.s3 = S3Store;


module.exports = { Store };
