'use strict';

const defaults = require('lodash.defaults');
const cloneDeep = require('lodash.clonedeep');

const args = require('minimist')(process.argv.slice(2), {
    alias: { c: 'config' },
    default: { config: './config/config.json' },
    boolean: ['isStreamingEnabled', 'isClusteringEnabled'],
});
const fs = require('fs-extra');
const { version } = require('../package');

const REQUIRED_FIELDS = [
    'capture',
    'store',
    'logging',
];

const OPTIONAL_DEFAULTS = {
    isStreamingEnabled: true,
    version,
};

class Configuration {
    constructor() {
        const configFile = args.config;
        const config = fs.readJsonSync(configFile);

        // Check for required fields. If any of the required fields are not present, throw an exception
        REQUIRED_FIELDS.forEach((field) => {
            if (!config[field]) {
                throw new Error(`Required field ${field} is not present in the configuration`);
            }
        });

        // Apply defaults to the configuration data for the optional fields
        this.config = defaults(config, OPTIONAL_DEFAULTS, { version });
    }

    get() {
        return cloneDeep(this.config);
    }

    getVersion() {
        const { version: versionValue = 'UNKNOWN' } = this.config;
        return versionValue;
    }
}

module.exports = { Configuration };
