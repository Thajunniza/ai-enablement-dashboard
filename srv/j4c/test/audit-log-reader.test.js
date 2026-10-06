'use strict';

// Runs the reader against a fake Destination service and a fake fetch. No network, no database.

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

// Replace the Cloud SDK, which the reader loads when it needs the destination
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === '@sap-cloud-sdk/connectivity') {
        return {
            getDestination: async () => ({
                url: 'https://audit.example/',
                authTokens: [{ http_header: { value: 'Bearer test-token' } }]
            })
        };
    }
    return originalLoad.call(this, request, ...rest);
};

const { readJouleAccess } = require('../lib/activeUsers/audit-log-reader');
const { AUDIT_LOG } = require('../lib/constants');

const SOURCE = { key: 'T', clientId: 'app-1', auditLogDestination: 'FAKE' };

// A raw audit log record shaped like the real ones
const record = (time, client, user) => ({
    time,
    message: JSON.stringify({
        data: JSON.stringify({
            message: `TokenIssuedEvent ('{"client_id":"${client}","user_name":"${user}"}'): principal=x`
        })
    })
});

const answer = (body, { status = 200, paging = null } = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name === 'Paging' ? paging : null) },
    json: async () => body
});

// Runs fn with a fake fetch and sleeps that do not wait
async function withFakes(fakeFetch, fn) {
    const realFetch = global.fetch;
    const realTimeout = global.setTimeout;
    global.fetch = fakeFetch;
    global.setTimeout = (callback) => { callback(); return 0; };
    try {
        return await fn();
    } finally {
        global.fetch = realFetch;
        global.setTimeout = realTimeout;
    }
}

test('reads every page and keeps only this application and these days', async () => {
    const urls = [];
    const pages = [
        answer(
            [record('2026-10-05T01:00:00Z', 'app-1', 'A@x.com'), record('2026-10-05T02:00:00Z', 'other', 'b@x.com')],
            { paging: 'handle=h1' }
        ),
        answer([record('2026-10-04T09:00:00Z', 'app-1', 'c@x.com'), record('2026-10-03T09:00:00Z', 'app-1', 'd@x.com')])
    ];
    const result = await withFakes(async (url) => { urls.push(url); return pages.shift(); },
        () => readJouleAccess(SOURCE, '2026-10-04', '2026-10-05'));

    assert.strictEqual(result.scanned, 4);
    assert.deepStrictEqual(result.accessEvents, [
        { email: 'a@x.com', date: '2026-10-05' },
        { email: 'c@x.com', date: '2026-10-04' }
    ]);
    assert.ok(urls[0].startsWith('https://audit.example/auditlog/v2/auditlogrecords?time_from=2026-10-04T00:00:00'));
    assert.ok(urls[1].includes('handle=h1'));
});

test('tries again after a 429 (too many requests)', async () => {
    const replies = [answer([], { status: 429 }), answer([record('2026-10-05T01:00:00Z', 'app-1', 'a@x.com')])];
    let calls = 0;
    const result = await withFakes(async () => { calls++; return replies.shift(); },
        () => readJouleAccess(SOURCE, '2026-10-05', '2026-10-05'));
    assert.strictEqual(calls, 2);
    assert.strictEqual(result.accessEvents.length, 1);
});

test('a timeout gives a clear message', async () => {
    const timeout = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    await assert.rejects(
        withFakes(async () => { throw timeout; }, () => readJouleAccess(SOURCE, '2026-10-05', '2026-10-05')),
        /timed out after 30000 ms/
    );
});

test('a 401 points at the credentials', async () => {
    await assert.rejects(
        withFakes(async () => answer([], { status: 401 }), () => readJouleAccess(SOURCE, '2026-10-05', '2026-10-05')),
        /HTTP 401 \(check the destination login/
    );
});

test('fails loudly when the window needs more pages than allowed', async () => {
    let n = 0;
    const endless = async () => answer([record('2026-10-05T01:00:00Z', 'app-1', 'a@x.com')], { paging: `handle=h${++n}` });
    await assert.rejects(
        withFakes(endless, () => readJouleAccess(SOURCE, '2026-10-05', '2026-10-05')),
        new RegExp(`more than ${AUDIT_LOG.MAX_PAGES} pages`)
    );
});

test('an answer that is not a list of records is an error', async () => {
    await assert.rejects(
        withFakes(async () => answer({ error: 'x' }), () => readJouleAccess(SOURCE, '2026-10-05', '2026-10-05')),
        /unexpected answer/
    );
});