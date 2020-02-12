'use strict';

const AWS = require('aws-sdk');
const fs = require('fs-extra');
const { DateTime } = require('luxon');

// ================================================== Initialization ===================================================
const args = require('minimist')(process.argv.slice(2), {
    alias: {
        b: 'bucket', d: 'startDate', z: 'timezone', r: 'region',
    },
    default: {
        startDate: DateTime.local().toFormat('M/d/yyyy'),
        timezone: 'America/Chicago',
        region: 'us-gov-east-1',
    },
});

const {
    bucket, startDate, timezone, region,
} = args;

if (!bucket) {
    throw new Error('AWS S3 bucket name "bucket" (-b) argument required');
}

const s3 = new AWS.S3({ region });

const [startTimestamp, endTimestamp] = (() => {
    const dateTime = DateTime.fromFormat(startDate, 'M/d/yyyy', { zone: timezone });

    if (!dateTime.isValid) {
        throw new Error(`Invalid start date "startDate" (-d) argument ${startDate}, must be M/D/YYYY`);
    }

    return [
        dateTime.startOf('day').toMillis(),
        dateTime.endOf('day').toMillis(),
    ];
})();

// ===================================================== Utilities =====================================================
const makeNiceTimestamp = timestamp => DateTime.fromMillis(timestamp).setZone(timezone).toFormat('f');

const getPercent = timestamp => (((timestamp - startTimestamp) * 100.0) / (endTimestamp - startTimestamp)).toFixed(2);

const getLastTimestamp = contents => +(contents[contents.length - 1].split('_')[0]);

// =================================================== Read from S3 ====================================================
const listObjects = async () => {
    const readS3 = async (objects = [], nextToken = null) => {
        const params = {
            Bucket: bucket,
            StartAfter: startTimestamp.toString(),
        };
        if (nextToken) {
            Object.assign(params, { ContinuationToken: nextToken });
        }

        try {
            const listResults = await s3.listObjectsV2(params).promise();
            const { IsTruncated: isTruncated, Contents: contents } = listResults;

            const filteredContents = contents.filter((object) => {
                const { Key: key } = object;
                const [token] = key.split('_');
                const timestamp = +token;

                return (!Number.isNaN(timestamp) && timestamp >= startTimestamp && timestamp <= endTimestamp);
            }).map(object => object.Key);

            if (filteredContents.length === 0) {
                return objects;
            }

            objects.push(...filteredContents);

            const lastTimestamp = getLastTimestamp(filteredContents);
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write(`Retrieved ${objects.length} objects (${getPercent(lastTimestamp)}%)`);

            if (isTruncated) {
                const { NextContinuationToken: token } = listResults;
                await readS3(objects, token);
            }
        } catch (err) {
            console.log(`Error reading objects from bucket ${bucket}`);
            console.log(err.toString());
            console.log(err.stack);
            throw err;
        }

        return objects;
    };

    const results = await readS3();
    return results;
};

(async () => {
    console.log(`Reading S3 bucket ${bucket} for objects between ${makeNiceTimestamp(startTimestamp)} to ${makeNiceTimestamp(endTimestamp)}`);
    const objects = await listObjects();

    const outputFileName = `s3-objects_${startTimestamp}-${endTimestamp}.txt`;
    console.log();
    console.log(`Saving ${objects.length} objects to ${outputFileName}`);
    await fs.outputFile(outputFileName, objects.join('\n'));
})();
