'use strict';

const Bottle = require('bottlejs');
const { Configuration } = require('./configuration');
const { Logger } = require('./logger');
const { Process } = require('./process');
const { Output } = require('./output');
const { Sessions } = require('./sessions');

const system = new Bottle();

system.service('Configuration', Configuration);
system.service('Process', Process);
system.service('Sessions', Sessions)
system.factory('Logger', Logger.createLogger);
system.factory('Output', Output.createOutput);

module.exports = system.container;
