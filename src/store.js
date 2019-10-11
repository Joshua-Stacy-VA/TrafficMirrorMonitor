'use strict';

const path = require('path');
const { DateTime } = require('luxon');
const fs = require('fs-extra');
const AWS = require('aws-sdk');

const STORE_CLASS_MAP = {};

class Store {
    constructor(options) {
        const { log } = options;
        Object.assign(this, { log });
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
        const StoreClass = STORE_CLASS_MAP[type];

        const storeInstance = new StoreClass({ log, ...options });
        return storeInstance;
    }
}

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

STORE_CLASS_MAP.local = LocalStore;


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

STORE_CLASS_MAP.s3 = S3Store;


module.exports = { Store };
