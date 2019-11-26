'use strict';

const EventEmitter = require('events');
const path = require('path');
const chalk = require('chalk');
const PQueue = require('p-queue');
const fs = require('fs-extra');
const AWS = require('aws-sdk');
const pick = require('lodash.pick');

class Session extends EventEmitter {
    constructor(id, options) {
        super();

        const { client, target } = options;
        const [shortId] = id.split('-');
        Object.assign(this, {
            id,
            shortId,
            client,
            target,
            isClosed: false,
            sequenceId: 0,
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
        });
    }

    push(source, data) {
        if (this.isClosed) {
            return;
        }

        const { [source]: list } = this.payload;

        list.push({
            data: data.toString(),
            timestamp: Date.now(),
            sequenceNumber: this.nextSequenceId(),
        });

        this.count += 1;
    }

    close() {
        if (this.isClosed) {
            return;
        }

        this.isClosed = true;

        this.emit('CLOSE');
        this.removeAllListeners();
    }

    flush() {
        if (!this.count) {
            return;
        }

        const data = pick(this, 'id', 'client', 'target', 'payload');
        this.reset();

        return data;
    }

    nextSequenceId() {
        this.sequenceId += 1;
        return this.sequenceId.toString().padStart(12, '0');
    }
}

// ================================================ Base Storage Class =================================================
class Store extends Map {
    constructor(options) {
        super();

        const {
            log, timeout = 10000, ...rest
        } = options;

        Object.assign(this, {
            log,
            timeout,
            queue: new PQueue(),
            checkData: this.checkData.bind(this),
            ...rest,
        });

        const { type } = this;
        this.StoreClass = Store.classMap[type];

        this.log.info(`Store saving stream data every ${chalk.bold(timeout / 1000)} seconds`);
        this.flush = setInterval(() => {
            this.forEach(this.checkData);
        }, timeout);
    }

    checkData(session) {
        const data = session.flush();
        if (!data) {
            return;
        }

        const { shortId = 'UNKNOWN' } = session;

        this.queue.add(async () => {
            const fileName = Store.generateFileName(data);
            await this.write(fileName, data);
            this.log.info(`[${chalk.bold(shortId)}] Saved stream data: ${chalk.bold(fileName)}`);
        });
    }

    open(id, { client, target }) {
        const session = new Session(id, { client, target });
        const { shortId } = session;

        this.log.debug(`[${chalk.bold(shortId)}] Opening stream data store`);

        session.on('CLOSE', () => {
            this.log.debug(`[${chalk.bold(shortId)}] Closing stream data store`);

            // Flush any data that might be resident in the session, then perform clean-up
            this.checkData(session);

            session.removeAllListeners();
            this.delete(id);
        });

        this.set(id, session);

        this.push(id, 'control', 'LINK_ESTABLISH');
    }

    close(id, source = 'TARGET') {
        this.push(id, 'control', `LINK_${source}_TEARDOWN`);

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

    /**
     * Static class factory method, used for BottleJS dependency injection
     * @param  {Bottle} system BottleJS interface object
     * @return {Store}
     *
     * See {@link https://github.com/young-steveo/bottlejs|BottleJS on GitHub} for more info on BottleJS
     */
    static create(system) {
        const { Configuration, Logger } = system;
        const log = Logger.getLogger();

        const { store } = Configuration.get();
        const { type, options } = store;
        const StoreClass = Store.classMap[type];

        if (!StoreClass) {
            throw new Error(`Storage type ${type} not supported! Check the configuration file`);
        }

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
