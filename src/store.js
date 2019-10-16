'use strict';

const path = require('path');
const PQueue = require('p-queue');
const { DateTime } = require('luxon');
const fs = require('fs-extra');
const AWS = require('aws-sdk');

// ================================================ Base Storage Class =================================================
class Store extends Map {
    constructor(options) {
        super();

        const { log, threshold = 200, ...rest } = options;
        Object.assign(this, {
            log,
            threshold,
            queue: new PQueue(),
            sequenceId: 0,
            ...rest,
        });

        const { type } = this;
        this.StoreClass = Store.classMap[type];
    }

    push(id, source, data) {
        const session = this.get(id);
        if (!session) {
            return;
        }

        const { payload, count } = session;
        const { [source]: dataList } = payload;

        dataList.push({
            data,
            timestamp: Date.now(),
            sequenceNumber: this.sequenceId.toString(),
        });

        this.sequenceId += 1;

        if (count > this.threshold) {
            this.flush(id);
        } else {
            Object.assign(session, { count: count + 1 });
        }
    }

    open({ id, client, target }) {
        this.set(id, {
            id,
            client,
            target,
        });
        this.reset(id);
        this.push(id, 'control', 'LINK_ESTABLISH');
    }

    close({ id }) {
        this.push(id, 'control', 'LINK_TEARDOWN');

        const session = this.get(id);
        if (!session) {
            return;
        }

        session.isClosed = true;
        this.flush(id);
        this.delete(id);
    }

    reset(id) {
        const session = this.get(id);
        Object.assign(session, {
            count: 0,
            payload: {
                client: [],
                target: [],
                control: [],
            },
        });
    }

    async flush(id) {
        const session = this.get(id);
        if (!session) {
            return;
        }

        const { client, target, payload } = session;
        const data = {
            id,
            client,
            target,
            payload,
        };
        this.reset(id);

        this.queue.add(async () => {
            const fileName = Store.generateFileName(data);
            this.log.debug(`Writing ${fileName}...`);
            await this.write(fileName, data);
        });
    }

    clientData({ id, data }) {
        this.push(id, 'client', data.toString());
    }

    targetData({ id, data }) {
        this.push(id, 'target', data.toString());
    }

    static generateFileName(data) {
        const { id } = data;
        const timestamp = DateTime.utc().toMillis();
        return `${timestamp}_${id}.json`;
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
