'use strict';

class Session {
    constructor(id, client, target) {
        Object.assign(this, {
            id,
            client,
            target,
        });
    }

    reset() {
        const { id, client, target } = this;
        Object.assign(this, {
            data: {
                id,
                client,
                target,
                payload: {
                    client: [],
                    target: [],
                    control: [],
                },
            },
        });
    }

    push(type, data) {
        const { payload } = this.data;
        const dataArray = payload[type];

        if (!Array.isArray(dataArray)) {
            return;
        }

        dataArray.push(data);

        // TODO: Check data size limits, write if we've passed the threshold

        // TODO: Start the timed write trigger
    }
}

class Sessions {
    constructor() {
        Object.assign(this, {
            sessions: new Map(),
        });
    }

    create(id) {
        const session = new Session(id);
        this.sessions.set(id, session);

        return session;
    }

    destroy(id) {
        const session = this.sessions.get(id);
        if (!session) {
            return;
        }

        // Delete the session out of the session map
        this.sessions.delete(id);

        // TODO: Trigger one more send on the session
    }

    list() {
        return Array.from(this.sessions.values());
    }
}

module.exports = { Sessions };
