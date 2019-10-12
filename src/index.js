'use strict';

const Bottle = require('bottlejs');
const chalk = require('chalk');
const { Configuration } = require('./configuration');
const { Logger } = require('./logger');
const { Process } = require('./process');
const { Store } = require('./store');
const { Sessions } = require('./sessions');

// Set up the system services via dependency injection handler
const system = new Bottle();
system.service('Configuration', Configuration);
system.service('Sessions', Sessions);
system.factory('Logger', Logger.createLogger);
system.factory('Process', Process.createProcess);
system.factory('Store', Store.createStore);

// Instantiate the following services immediately here
system.digest(['Process']);


const {
    Logger: LoggerService,
    Configuration: ConfigurationService,
} = system.container;

const log = LoggerService.getLogger();
const { version } = ConfigurationService.get();

const versionString = chalk.bold(version);
log.info(`Traffic Mirror Monitor, version ${versionString}`);
