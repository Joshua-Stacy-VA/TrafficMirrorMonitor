'use strict';

const { Logger, Process, Configuration } = require('./system');

const log = Logger.getLogger();

Process.onShutdown((type, reason, exitCode) => {
    log.log((exitCode === 0) ? 'info' : 'error', reason, { type, exitCode });
});

(async () => {
    const { version } = Configuration.get();

    log.info(`Traffic Mirror Monitor, version ${version}`);
})();
