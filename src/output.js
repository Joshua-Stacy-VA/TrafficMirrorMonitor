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

class LocalOutput {
    constructor(options) {
        const { baseDir = '.'} = options;
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

class S3Output {
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

const OUTPUT_CLASS_MAP = {
    local: LocalOutput,
    s3: S3Output,
};

class Output {
    static createOutput(system) {
        const { Configuration } = system;
        const { output } = Configuration.get();

        const { type, options } = output;
        const OutputClass = OUTPUT_CLASS_MAP[type];

        const outputInstance = new OutputClass(options);
        return outputInstance;
    }
}

module.exports = { Output };
