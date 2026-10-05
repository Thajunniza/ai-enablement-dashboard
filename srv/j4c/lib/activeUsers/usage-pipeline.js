'use strict';

const cds = require('@sap/cds');
const { toDay, addDays } = require('../../../shared/period-labels');
const { aggregate, mergeRoster } = require('../../../shared/roster');
const { readJouleAccess } = require('./audit-log-reader');

const NS = 'ai.enablement.dashboard';
const BUFFER_DAYS = 7;

// Finds the initiative the same way the SCIM job does: by its IAS group.
async function resolveInitiative(source) {
    const { Initiative } = cds.entities(NS);
    const initiative = await SELECT.one.from(Initiative).where({ iasGroup: source.iasGroup });
    if (!initiative) {
        throw new Error(`Usage source '${source.key}': no Initiative row with iasGroup '${source.iasGroup}' - check the seed CSV`);
    }
    return initiative;
}

// Step 1: audit log -> DailyAccess. Idempotent upsert on (person, accessDate).
async function ingest({ source, initiativeId, daysBack, today }) {
    const { Person, DailyAccess } = cds.entities(NS);
    const from = addDays(today, -(daysBack - 1));

    const { scanned, accessEvents } = await readJouleAccess(source, from, today);
    console.log('[usage] audit read done', accessEvents.length);

    const persons = await SELECT.from(Person).columns('scimId', 'email')
        .where({ initiative_ID: initiativeId });
    console.log('[usage] persons read', persons.length);

    const byEmail = new Map();
    for (const p of persons) {
        const k = (p.email || '').toLowerCase();
        if (k && !byEmail.has(k)) byEmail.set(k, p.scimId);
    }

    const rows = new Map();
    const unmatched = new Set();
    for (const ev of accessEvents) {
        const scimId = byEmail.get(ev.email);
        if (!scimId) { unmatched.add(ev.email); continue; }
        rows.set(`${scimId}|${ev.date}`, {
            person_scimId: scimId,
            person_initiative_ID: initiativeId,
            accessDate: ev.date
        });
    }
    if (rows.size) await UPSERT.into(DailyAccess).entries([...rows.values()]);
    console.log('[usage] daily rows saved', rows.size);

    if (unmatched.size) {
        cds.log('usage').warn(`${source.key}: ${unmatched.size} audit-log user(s) not found in Person by email; skipped`);
    }
    return {
        scanned,
        accessEvents: accessEvents.length,
        matched: rows.size,
        unmatchedUsers: unmatched.size
    };
}

// Step 2: DailyAccess -> ActiveUserList (WEEKLY, MONTHLY, YEARLY) for this initiative only,
// merged with what is stored. It runs inside the action's own transaction, so a failure in any
// step rolls the whole run back and the next run repeats it.
async function consolidate({ initiativeId }) {
    const { DailyAccess, ActiveUserList } = cds.entities(NS);
    const daily = await SELECT.from(DailyAccess)
        .columns('person_scimId', 'person_initiative_ID', 'accessDate')
        .where({ person_initiative_ID: initiativeId });
    if (!daily.length) return { rosterRows: 0 };

    const aggregated = aggregate(daily);
    const labels = [...new Set([...aggregated.values()].map((r) => r.periodLabel))];
    const existing = await SELECT.from(ActiveUserList)
        .where({ periodLabel: { in: labels }, person_initiative_ID: initiativeId });
    const merged = mergeRoster(aggregated, existing);
    if (merged.length) await UPSERT.into(ActiveUserList).entries(merged);
    return { rosterRows: merged.length };
}

// Step 3: only called after consolidate() resolved. Touches this initiative's rows only.
async function cleanup({ initiativeId, today }) {
    const { DailyAccess } = cds.entities(NS);
    const cutoff = addDays(today, -BUFFER_DAYS);
    const cleaned = await DELETE.from(DailyAccess)
        .where({ person_initiative_ID: initiativeId, accessDate: { '<': cutoff } });
    return { cleaned: Number(cleaned) || 0 };
}

// source = { key, iasGroup, clientId } for ONE initiative. Any failure throws, so the job is marked
// failed and the next run repeats the same work safely (everything is an upsert).
async function runPipeline({ source, daysBack = 3 }) {
    if (!source || !source.key || !source.iasGroup) {
        throw new Error('runPipeline: source needs a key and an iasGroup');
    }
    if (!source.clientId) {
        throw new Error(`Usage source '${source.key}' has no clientId (the client_id of its application in the audit log)`);
    }
    const today = toDay(new Date());
    const initiative = await resolveInitiative(source);
    console.log('[usage] initiative found');
    const a = await ingest({ source, initiativeId: initiative.ID, daysBack, today });
    console.log('[usage] ingest done', a);
    const b = await consolidate({ initiativeId: initiative.ID });
    console.log('[usage] consolidate done', b);
    const c = await cleanup({ initiativeId: initiative.ID, today });
    console.log('[usage] cleanup done', c);
    return { ...a, ...b, ...c };
}

module.exports = { runPipeline, resolveInitiative, ingest, consolidate, cleanup };