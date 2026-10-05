'use strict';

// Reads the SAP Audit Log Retrieval API and turns raw records into
// { email, date } "access" facts for one initiative.
//
// API (documented for the Cloud Foundry Audit Log Retrieval API):
//   GET <service key url>/auditlog/v2/auditlogrecords?time_from=...&time_to=...   (UTC, 2018-05-11T10:42:00)
//   Authorization: Bearer <token from <uaa.url>/oauth/token?grant_type=client_credentials>
//   500 records per chunk; the next chunk's handle comes back in the `Paging: handle=<value>` header
//   and is sent back unchanged as the `handle` query parameter.
//   Rate limit 4-8 requests/second per token depending on region.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REQUEST_TIMEOUT_MS = 30000;
const MAX_PAGES = 100;           // safety stop: 100 pages = 50,000 records

// Where the service key comes from, in this order:
//   AUDITLOG_CREDENTIALS_FILE  path to a JSON file holding the service key (local runs)
//   AUDITLOG_CREDENTIALS       the same JSON as a string (local runs)
//   the bound audit log management service (Cloud Foundry)
function credentials() {
    if (process.env.AUDITLOG_CREDENTIALS_FILE) {
        return JSON.parse(require('fs').readFileSync(process.env.AUDITLOG_CREDENTIALS_FILE, 'utf8'));
    }
    if (process.env.AUDITLOG_CREDENTIALS) return JSON.parse(process.env.AUDITLOG_CREDENTIALS);
    const xsenv = require('@sap/xsenv');
    return xsenv.serviceCredentials({ label: 'auditlog-management' });
}

async function getToken(creds) {
    const res = await fetch(`${creds.uaa.url}/oauth/token?grant_type=client_credentials`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${creds.uaa.clientid}:${creds.uaa.clientsecret}`).toString('base64')
        }
    });
    if (!res.ok) throw new Error(`Audit log token request failed: HTTP ${res.status}`);
    return (await res.json()).access_token;
}

async function getWithRetry(url, token) {
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        if (res.status === 429 && attempt < 4) { await sleep(1000 * attempt); continue; }
        if (!res.ok) throw new Error(`Audit log retrieval failed: HTTP ${res.status}`);
        return res;
    }
}

// fromDay / toDay are inclusive UTC days ("YYYY-MM-DD"). Returns every raw record in the window.
// Stops when there is no next handle, when a page comes back empty, when a handle repeats,
// or after MAX_PAGES pages, so a paging problem can never loop forever.
async function fetchRecords(fromDay, toDay) {
    const creds = credentials();
    const token = await getToken(creds);
    const base = `${creds.url}/auditlog/v2/auditlogrecords`;
    const window = `time_from=${fromDay}T00:00:00&time_to=${toDay}T23:59:59`;

    const records = [];
    const seen = new Set();
    let handle = null;
    let page = 0;
    for (;;) {
        const url = handle ? `${base}?${window}&handle=${encodeURIComponent(handle)}` : `${base}?${window}`;
        const res = await getWithRetry(url, token);
        const chunk = await res.json();
        page++;
        const paging = res.headers.get('Paging');
        console.log(`[audit-log] page ${page}: ${Array.isArray(chunk) ? chunk.length : 'not an array'} records, Paging header ${paging ? 'present' : 'absent'}`);
        if (Array.isArray(chunk)) records.push(...chunk);

        const m = paging && /handle=(.+)/.exec(paging);
        const next = m ? m[1] : null;
        if (!next || !Array.isArray(chunk) || chunk.length === 0 || seen.has(next)) break;
        if (page >= MAX_PAGES) {
            console.warn(`[audit-log] stopped after ${MAX_PAGES} pages; the window may hold more records`);
            break;
        }
        seen.add(next);
        handle = next;
        await sleep(150);
    }
    return records;
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
    if (typeof text !== 'string' || !text.startsWith('TokenIssuedEvent')) return null;

    const client = /"client_id":"([^"]+)"/.exec(text);
    if (!client || client[1] !== clientId) return null;

    const name = /"user_name":"([^"]+)"/.exec(text);
    const email = ((name && name[1]) || record.user || '').trim().toLowerCase();
    if (!email.includes('@')) return null;

    const date = String(record.time || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { email, date };
}

async function readJouleAccess(source, fromDay, toDay) {
    const records = await fetchRecords(fromDay, toDay);
    const accessEvents = [];
    for (const rec of records) {
        const ev = extractAccess(rec, source.clientId);
        if (ev && ev.date >= fromDay && ev.date <= toDay) accessEvents.push(ev);
    }
    return { scanned: records.length, accessEvents };
}

module.exports = { fetchRecords, extractAccess, readJouleAccess };