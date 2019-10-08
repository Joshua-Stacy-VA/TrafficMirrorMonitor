'use strict';

const winston = require('winston');
const CloudWatch = require('winston-aws-cloudwatch');

const { format, transports } = winston;
const { Console, File } = transports;

class Logger {
    constructor() {
        this.log = winston.createLogger({ level: 'info' });
    }

    configure(config) {
        if (Array.isArray(config)) {
            config.forEach(configElement => this.configure(configElement));
            return;
        }
        this.log.add(Logger.createTransport(config));
    }

    static createLogger(system) {
        const { Configuration } = system;
        const { logging } = Configuration.get();

        const logger = new Logger();
        logger.configure(logging);

        return logger;
    }

    static createTransport(config) {
        const defaults = { level: 'info' };
        switch (config.type) {
            case 'console':
                return new Console(Object.assign(defaults, config, { format: Logger.consoleFormat() }));
            case 'file':
                return new File(Object.assign(defaults, config, { format: Logger.fileFormat() }));
            case 'cloudwatch':
                return new CloudWatch(Object.assign(defaults, config, {
                    createLogGroup: true,
                    createLogStream: true,
                    format: Logger.objectFormat(),
                }));
            default:
                throw new Error(`Unsupported logger transport type "${config.type}" specified"`);
        }
    }

    static consoleFormat() {
        return format.combine(
            Logger.baseFormat(),
            Logger.formatLevelString(),
            format.colorize({ all: true }),
            format.printf(Logger.formatOutputString),
        );
    }

    static fileFormat() {
        return format.combine(
            Logger.baseFormat(),
            Logger.formatLevelString(),
            format.printf(Logger.formatOutputString),
        );
    }

    static baseFormat(options = {}) {
        return format.combine(
            format.metadata({ key: 'data' }),
            Logger.processId(),
            format.timestamp({ format: 'MM-DD-YYYY HH:mm:ss.SSS' }),
            format.errors({ stack: true }),
        );
    }

    static objectFormat() {
        return format.combine(
            Logger.processId(),
            format.timestamp(),
            format.errors({ stack: true }),
            format.json(),
        );
    }

    static processId() {
        return format(info => Object.assign(info, { pid: process.pid }))();
    }

    static formatLevelString() {
        return format((info) => {
            info.level = ` ${info.level}`.slice(-5).toUpperCase();
            return info;
        })();
    }

    static formatOutputString(info) {
        const { data } = info;
        const str = ((typeof data === 'object') && (Object.keys(data).length > 0)) ? ` ${JSON.stringify(data)}` : '';
        return `${info.timestamp} [${info.pid}] ${info.level}: ${info.message}${str}`;
    }

    getLogger() {
        return this.log;
    }
}

module.exports = {
    Logger };
