'use strict';

const path = require('path');
const { DateTime } = require('luxon');
const fs = require('fs-extra');
const AWS = require('aws-sdk');

const generateFileName = (data) => {
    const { id } = data;
    const timestamp = DateTime.utc().toMillis();
    return `${timestamp}_${id}.json`;
};

class LocalStore {
    constructor(options) {
        const { baseDir = '.' } = options;
        Object.assign(this, {
            baseDir,
        });

        fs.ensureDirSync(baseDir);
    }

    async write(data) {
        const fileName = generateFileName(data);
        await fs.writeJson(path.join(this.baseDir, fileName), data, { spaces: 2 });
    }
}

class S3Store {
    constructor(options) {
        const { region, bucket } = options;
        Object.assign(this, {
            s3: new AWS.S3({ region }),
            bucket,
        });
    }

    async write(data) {
        const fileName = generateFileName(data);
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: fileName,
            Body: JSON.stringify(data, null, 2),
        }).promise();
    }
}

const STORE_CLASS_MAP = {
    local: LocalStore,
    s3: S3Store,
};

class Store {
    static createStore(system) {
        const { Configuration } = system;
        const { store } = Configuration.get();

        const { type, options } = store;
        const StoreClass = STORE_CLASS_MAP[type];

        const storeInstance = new StoreClass(options);
        return storeInstance;
    }
}

module.exports = { Store };
