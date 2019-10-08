'use strict';

const { Output } = require('../src/output');

const createSystemMock = (type, options) => ({
    Configuration: {
        get: () => ({ output: { type, options } }),
    },
});

test('Creation and initialization', async () => {
    const options = { baseDir: 'testOutput' };
    const output = Output.createOutput(createSystemMock('local', options));

    await output.write({
        id: '12345',
        test: 'WORKED!',
    });
});
