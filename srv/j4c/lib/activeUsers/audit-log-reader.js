'use strict';

// Reads the SAP Audit Log Retrieval API and turns raw records into
// { email, date } "access" facts for one initiative.
//
// API (documented for the Cloud Foundry Audit Log Retrieval API):
//   GET <base url>/auditlog/v2/auditlogrecords?time_from=...&time_to=...   (UTC, 2018-05-11T10:42:00)
//   500 records per chunk; the next chunk's handle comes back in the `Paging: handle=<value>` header
//   and is sent back unchanged as the `handle` query parameter.
//
// The connection comes from a destination (source.auditLogDestination) in the Destination service,
// type OAuth2ClientCredentials. The Destination service fetches the token; no secret is kept in code.
// Timeouts, limits and the event type are in ../constants.js.

const cds = require('@sap/cds');
const { AUDIT_LOG } = require('../constants');

// Page-by-page progress is logged at debug level, so it is silent by default.
// To see it, set "cds": { "log": { "levels": { "audit-log": "debug" } } } in package.json.
const LOG = cds.log('audit-log');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The Destination service fetches the OAuth token and hands it back with the destination.
async function accessFromDestination(name) {
    const { getDestination } = require('@sap-cloud-sdk/connectivity');
    const destination = await getDestination({ destinationName: name });
    if (!destination) throw new Error(`Audit log destination '${name}' was not found`);

    const token = destination.authTokens && destination.authTokens[0];
    if (!token || token.error || !token.http_header) {
        throw new Error(`Audit log destination '${name}' returned no token${token && token.error ? ': ' + token.error : ''}`);
    }
    return { baseUrl: destination.url.replace(/\/+$/, ''), authorization: token.http_header.value };
}

async function getAccess(source) {
    if (!source.auditLogDestination) {
        throw new Error(`Usage source '${source.key}' has no auditLogDestination`);
    }
    return accessFromDestination(source.auditLogDestination);
}

async function getWithRetry(url, authorization) {
    for (let attempt = 1; ; attempt++) {
        let res;
        try {
            res = await fetch(url, {
                headers: { Authorization: authorization },
                signal: AbortSignal.timeout(AUDIT_LOG.REQUEST_TIMEOUT_MS)
            });
        } catch (err) {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                throw new Error(`Audit log request timed out after ${AUDIT_LOG.REQUEST_TIMEOUT_MS} ms`);
            }
            throw err;
        }

        if (res.status === 429 && attempt < AUDIT_LOG.MAX_ATTEMPTS) {
            await sleep(AUDIT_LOG.RETRY_BACKOFF_MS * attempt);
            continue;
        }
        if (!res.ok) {
            const hint = res.status === 401 || res.status === 403
                ? ' (check the destination login and the audit log service key)'
                : '';
            throw new Error(`Audit log retrieval failed: HTTP ${res.status}${hint}`);
        }
        return res;
    }
}

// Yields the records of the window one page at a time, so a long window never has to sit in
// memory. fromDay / toDay are inclusive UTC days ("YYYY-MM-DD").
// Ends when there is no next handle, when a page is empty or when a handle repeats.
// Throws when the window needs more than MAX_PAGES pages, because carrying on with
// partial data would quietly under-count.
async function* fetchPages(source, fromDay, toDay) {
    const { baseUrl, authorization } = await getAccess(source);
    const base = `${baseUrl}${AUDIT_LOG.API_PATH}`;
    const range = `time_from=${fromDay}T00:00:00&time_to=${toDay}T23:59:59`;

    const seen = new Set();
    let handle = null;
    for (let page = 1; ; page++) {
        const url = handle ? `${base}?${range}&handle=${encodeURIComponent(handle)}` : `${base}?${range}`;
        const res = await getWithRetry(url, authorization);
        const chunk = await res.json();
        if (!Array.isArray(chunk)) {
            throw new Error('Audit log retrieval returned an unexpected answer (expected a list of records)');
        }

        const paging = res.headers.get('Paging');
        LOG.debug(`page ${page}: ${chunk.length} records, Paging header ${paging ? 'present' : 'absent'}`);
        yield chunk;

        const m = paging && /handle=(.+)/.exec(paging);
        const next = m ? m[1] : null;
        if (!next || chunk.length === 0 || seen.has(next)) return;
        if (page >= AUDIT_LOG.MAX_PAGES) {
            throw new Error(
                `Audit log window ${fromDay} to ${toDay} needs more than ${AUDIT_LOG.MAX_PAGES} pages. ` +
                'Use a shorter window, or raise AUDIT_LOG.MAX_PAGES in constants.js.'
            );
        }
        seen.add(next);
        handle = next;
        await sleep(AUDIT_LOG.PAGE_DELAY_MS);
    }
}

function parseMaybeJson(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (e) { return null; }
}

// Record -> { email, date } when the record shows a user being issued a token for the given
// client, otherwise null.
//   record.message       JSON string (or object) with a `data` JSON string inside
//   data.message         "TokenIssuedEvent ('{...token claims...}'): principal=..."
//   token claims         client_id (the application), user_name (the user's email)
function extractAccess(record, clientId) {
    const outer = parseMaybeJson(record && record.message);
    const data = outer && parseMaybeJson(outer.data);
    const text = data && data.message;
    if (typeof text !== 'string' || !text.startsWith(AUDIT_LOG.TOKEN_EVENT_PREFIX)) return null;

    const client = /"client_id":"([^"]+)"/.exec(text);
    if (!client || client[1] !== clientId) return null;

    const name = /"user_name":"([^"]+)"/.exec(text);
    const email = ((name && name[1]) || record.user || '').trim().toLowerCase();
    if (!email.includes('@')) return null;

    const date = String(record.time || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { email, date };
}

// Reads the window and keeps only the sign-ins of this source's application.
// scanned = every record looked at, accessEvents = the sign-ins that count.
async function readJouleAccess(source, fromDay, toDay) {
    let scanned = 0;
    const accessEvents = [];
    for await (const chunk of fetchPages(source, fromDay, toDay)) {
        scanned += chunk.length;
        for (const rec of chunk) {
            const ev = extractAccess(rec, source.clientId);
            if (ev && ev.date >= fromDay && ev.date <= toDay) accessEvents.push(ev);
        }
    }
    return { scanned, accessEvents };
}

module.exports = { extractAccess, readJouleAccess };