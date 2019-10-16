'use strict';

const path = require('path');
const { DateTime } = require('luxon');
const fs = require('fs-extra');
const AWS = require('aws-sdk');

// ================================================ Base Storage Class =================================================
class Store {
    constructor(options) {
        Object.assign(this, {
            sessions: new Map(),
            ...options,
        });

        const { type } = this;
        this.StoreClass = Store.classMap[type];
    }

    data(id, source, data) {
        const session = this.sessions.get(id);
        if (!session) {
            return;
        }

        const { payload } = session;

        payload[source].push({
            data,
            timestamp: Date.now(),
            sequenceNumber: '',
        });
    }

    open(id, { client, target }) {
        this.sessions.set(id, {
            id,
            client,
            target,
            payload: {
                client: [],
                target: [],
                control: [],
            },
        });

        this.data(id, 'control', 'LINK_ESTABLISH');
    }

    close(id) {
        this.data(id, 'control', 'LINK_TEARDOWN');
    }

    clientData(id, data) {
        this.data(id, 'client', data.toString());
    }

    targetData(id, data) {
        this.data(id, 'target', data.toString());
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

    async write(data) {
        const fileName = Store.generateFileName(data);
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

    async write(data) {
        const fileName = Store.generateFileName(data);
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: fileName,
            Body: JSON.stringify(data, null, 2),
        }).promise();
    }
}

Store.classMap.s3 = S3Store;


module.exports = { Store };
