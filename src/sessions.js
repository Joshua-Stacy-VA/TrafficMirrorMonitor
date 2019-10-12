'use strict';

class Session {
    constructor(id, client, target) {
        Object.assign(this, {
            id,
            client,
            target,
            payload: {
                client: [],
                target: [],
                control: [],
            },
        });
    }

    open() {}

    close() {}

    clientData(data) {}

    targetData(data) {}

    handleData(source, data) {}

    store() {}
}

class SessionManager {
    constructor() {
        Object.assign(this, {
            sessions: new Map(),
        });
    }

    create(id, { client, target }) {
        const session = new Session(id, client, target);
        this.sessions.set(id, session);

        return session;
    }

    delete(id) {
        const session = this.sessions.get(id);
        if (!session) {
            return;
        }

        this.sessions.delete(id);

        // Store any data that might be in the session
        session.store();
    }
}

module.exports = { Sessions: SessionManager };
