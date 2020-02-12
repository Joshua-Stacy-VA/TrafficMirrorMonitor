'use strict';

class S3Mock {
    constructor() {
        Object.assign(this, {
            data: [],
            promise: jest.fn(),
            isError: false,
        });
    }

    reset() {
        this.data.splice(0);
        this.promise.mockReset();
    }

    putObject(data) {
        this.data.push(data);
        return {
            promise: () => new Promise((resolve, reject) => {
                this.promise();
                const functionToCall = this.isError ? reject : resolve;
                functionToCall();
            }),
        };
    }
}

module.exports = {
    S3Mock,
};
