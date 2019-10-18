'use strict';

const fs = require('fs-extra');
const AWS = require('aws-sdk');

jest.mock('fs-extra');
jest.mock('aws-sdk');

const { S3Mock } = require('./s3-mock');
const { Store } = require('../src/store');

const mock = new S3Mock();

AWS.S3.mockImplementation(() => mock);

const TEST_OUTPUT_DIR = 'testOutput';
const TEST_SESSION_ID = '12345678-abcde-09876543-ffff';
const TEST_CLIENT = '1.1.1.1:1000';
const TEST_TARGET = '2.2.2.2:2000';
const TEST_REGION = 'us-gov-west-1';
const TEST_BUCKET = 'testBucket';
const TEST_WRITE_DATA = {
    id: TEST_SESSION_ID,
    field: 'TEST',
};

const createSystemMock = (type, options) => ({
    Configuration: {
        get: () => ({ store: { type, options } }),
    },
    Logger: {
        getLogger: () => ({
            info: jest.fn(),
            debug: jest.fn(),
        }),
    },
});

test('LocalStore Creation/initialization/write', async () => {
    const options = { baseDir: TEST_OUTPUT_DIR };
    const store = Store.create(createSystemMock('local', options));

    expect(store.constructor.name).toBe('LocalStore');
    expect(store.baseDir).toBe(TEST_OUTPUT_DIR);
    expect(store.sessions.size).toBe(0);

    await store.write(TEST_WRITE_DATA);
    expect(fs.writeJson).toHaveBeenCalled();
});

test('S3Store Creation/initialization/write', async () => {
    const options = { region: TEST_REGION, bucket: TEST_BUCKET };
    const store = Store.create(createSystemMock('s3', options));

    expect(store.constructor.name).toBe('S3Store');
    expect(store.region).toBe(TEST_REGION);
    expect(store.bucket).toBe(TEST_BUCKET);
    expect(store.sessions.size).toBe(0);

    await store.write(TEST_WRITE_DATA);
    const [data] = mock.data;
    const { Bucket, Key } = data;

    expect(Bucket).toBe(TEST_BUCKET);
    expect(Key).toMatch(new RegExp(`${TEST_SESSION_ID}_\\d{13}.json`));
});

test('Rudimentary Store Operations', () => {
    const options = { baseDir: TEST_OUTPUT_DIR };
    const store = Store.create(createSystemMock('local', options));

    store.open(TEST_SESSION_ID, { client: TEST_CLIENT, target: TEST_TARGET });
    expect(store.sessions.size).toBe(1);

    const session = store.sessions.get(TEST_SESSION_ID);
    expect(session.id).toBe(TEST_SESSION_ID);
    expect(session.client).toBe(TEST_CLIENT);
    expect(session.target).toBe(TEST_TARGET);
    expect(session.payload.control).toHaveLength(1);

    store.clientData(TEST_SESSION_ID, 'CLIENT_TEST');
    expect(session.payload.client).toHaveLength(1);

    store.targetData(TEST_SESSION_ID, 'TARGET_TEST');
    expect(session.payload.target).toHaveLength(1);

    store.close(TEST_SESSION_ID);
    expect(session.payload.control).toHaveLength(2);

    // Try to write to a non-existent session, nothing should happen
    store.data('', 'control', 'ERROR_TEST');
    expect(session.payload.control).toHaveLength(2);
});
