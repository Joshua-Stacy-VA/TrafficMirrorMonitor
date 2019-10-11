'use strict';

const Bottle = require('bottlejs');
const { Configuration } = require('./configuration');
const { Logger } = require('./logger');
const { Process } = require('./process');
const { Store } = require('./store');
const { Sessions } = require('./sessions');


const system = new Bottle();
system.service('Configuration', Configuration);
system.service('Sessions', Sessions);
system.factory('Logger', Logger.createLogger);
system.factory('Process', Process.createProcess);
system.factory('Store', Store.createStore);
system.digest(['Process']);


const {
    Logger: LoggerService,
    Configuration: ConfigurationService,
} = system.container;

const log = LoggerService.getLogger();


(async () => {
    const { version } = ConfigurationService.get();

    log.info(`Traffic Mirror Monitor, version ${version}`);
})();
