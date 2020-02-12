'use strict';

const AWS = require('aws-sdk');
const fs = require('fs-extra');
const PQueue = require('p-queue');

// ================================================== Initialization ===================================================
const args = require('minimist')(process.argv.slice(2), {
    alias: {
        b: 'bucket', s: 'sourceFile', t: 'targetDir', r: 'region', c: 'concurrency',
    },
    default: {
        targetDir: 'output',
        region: 'us-gov-east-1',
        concurrency: 5,
    },
});

const {
    bucket, sourceFile, targetDir, region, concurrency,
} = args;

if (!bucket) {
    throw new Error('S3 Bucket "bucket" (-b) argument required');
}

if (!sourceFile) {
    throw new Error('S3 Object listing file "sourceFile" (-s) argument required');
}

const s3 = new AWS.S3({ region });

const objects = fs.readFileSync(sourceFile).toString().split('\n');

fs.ensureDirSync(targetDir);

// =================================================== Read from S3 ====================================================
let count = 0;
const getPercent = () => ((count * 100.0) / objects.length).toFixed(2);

const getObject = object => new Promise((resolve, reject) => {
    const output = fs.createWriteStream(`${targetDir}/${object}`);
    const params = {
        Bucket: bucket,
        Key: object,
    };
    s3.getObject(params).createReadStream().pipe(output)
        .on('close', () => {
            count += 1;
            resolve();
        })
        .on('error', (err) => {
            console.log(err);
            reject(err);
        });
});


(async () => {
    console.log(`Reading S3 bucket ${bucket} for ${objects.length} objects`);
    const queue = new PQueue({ concurrency });

    queue.on('active', () => {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(`Retrieved ${count} objects (${getPercent()}%)`);
    });

    queue.addAll(objects.map(object => getObject.bind(null, object)));
    await queue.onIdle();

    console.log('Done');
})();
