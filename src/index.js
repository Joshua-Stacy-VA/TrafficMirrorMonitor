'use strict';

const Bottle = require('bottlejs');
const chalk = require('chalk');
const { Configuration } = require('./configuration');
const { Logger } = require('./logger');
const { Process } = require('./process');
const { Capture } = require('./capture');
const { Store } = require('./store');

// Set up the system services via dependency injection handler
const system = new Bottle();
system.service('Configuration', Configuration);
system.factory('Logger', Logger.create);
system.factory('Process', Process.create);
system.factory('Capture', Capture.create);
system.factory('Store', Store.create);


// Display the application and version information
const {
    Logger: LoggerService,
    Configuration: ConfigurationService,
} = system.container;

const log = LoggerService.getLogger();
const version = chalk.bold(ConfigurationService.getVersion());

log.info(`Traffic Mirror Monitor, version ${version}`);


// Instantiate the following services here to start the application
system.digest(['Process', 'Capture']);
