'use strict';

const EVENT_OPTION_MAP = {
    exit: { type: 'CALL', isProcessExitEvent: true },
    SIGINT: { type: 'SIGNAL', isProcessExitEvent: false },
    SIGUSR1: { type: 'SIGNAL', isProcessExitEvent: false },
    SIGUSR2: { type: 'SIGNAL', isProcessExitEvent: false },
    uncaughtException: { type: 'EXCEPTION', isProcessExitEvent: false },
    unhandledRejection: { type: 'REJECT', isProcessExitEvent: false },
};

class Process {
    constructor() {
        // Add the mapped signals and shutdown handlers to process shutdown events
        Object.keys(EVENT_OPTION_MAP).forEach((event) => {
            const options = EVENT_OPTION_MAP[event];
            process.on(event, this._onShutdownEvent.bind(this, Object.assign(options, { name: event })));
        });

        Object.assign(this, {
            exitType: 'CALL',
            exitCode: 0,
            exitReason: 'Process Completion Exit',
            handleShutdown: null,
        });
    }

    _onShutdownEvent(options, reason) {
        if (options.isProcessExitEvent) {
            return this._exitProcess();
        }

        const { type = 'UNKNOWN' } = options;
        switch (type) {
            case 'SIGNAL':
                Object.assign(this, { exitCode: 0, exitReason: options.name });
                break;
            case 'EXCEPTION':
            case 'REJECT':
                Object.assign(this, { exitCode: 1, exitReason: reason });
                break;
            case 'UNKNOWN':
            default:
                this.exitCode = 0;
        }

        this.exitType = options.type;
        process.exit(this.exitCode);
    }

    _exitProcess() {
        if (this.handleShutdown) {
            this.handleShutdown(this.exitType, this.exitReason, this.exitCode);
        } else if (this.exitReason instanceof Error) {
            console.log('An error occurred before a shutdown handler was registered');
            console.log(this.exitReason.stack);
        }
        return this.exitCode;
    }

    shutdown(reason) {
        const type = reason ? 'EXCEPTION' : 'SIGNAL';
        const error = reason ? new Error(reason) : null;
        this._onShutdownEvent({
            type,
            name: 'USER_SHUTDOWN_EVENT',
            isProcessExitEvent: false,
        }, error);
    }

    onShutdown(shutdownFunc) {
        this.handleShutdown = (typeof shutdownFunc === 'function') ? shutdownFunc : this.handleShutdown;
    }

    /**
     * Static class factory method, used for BottleJS dependency injection
     * @param  {Bottle} system BottleJS interface object
     * @return {Process}
     *
     * See {@link https://github.com/young-steveo/bottlejs|BottleJS on GitHub} for more info on BottleJS
     */
    static create(system) {
        const { Logger } = system;
        const log = Logger.getLogger();

        const process = new Process();
        process.onShutdown((type, reason, exitCode) => {
            const isError = (exitCode !== 0);
            const logLevel = isError ? 'error' : 'info';

            log.log(logLevel, reason, { type, exitCode });
            if (isError) {
                const { stack = 'No call stack' } = reason;
                log.error(stack);
            }
        });

        return process;
    }
}

module.exports = { Process };
