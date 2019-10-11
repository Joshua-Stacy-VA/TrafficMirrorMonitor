'use strict';

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
        this.config = fs.readJsonSync(configFile);

        // Check for required fields. If any of the required fields are not present, throw an exception
        REQUIRED_FIELDS.forEach((field) => {
            if (!this.config[field]) {
                throw new Error(`Required field ${field} is not present in the configuration`);
            }
        });

        // Apply defaults to the configuration data for the optional fields
        this.config = Object.assign(OPTIONAL_DEFAULTS, this.config);
    }

    get() {
        return Object.assign({}, this.config);
    }
}

module.exports = { Configuration };
