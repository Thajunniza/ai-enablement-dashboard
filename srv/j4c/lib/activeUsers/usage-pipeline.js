'use strict';

const cds = require('@sap/cds');
const { toDay, addDays } = require('../../../shared/period-labels');
const { aggregate, mergeRoster } = require('../../../shared/roster');
const { NAMESPACE } = require('../../../shared/constants');
const { DAILY_BUFFER_DAYS } = require('../constants');
const { readJouleAccess } = require('./audit-log-reader');

const LOG = cds.log('usage');

// Finds the initiative the same way the SCIM job does: by its IAS group.
async function resolveInitiative(source) {
    const { Initiative } = cds.entities(NAMESPACE);
    const initiative = await SELECT.one.from(Initiative).where({ iasGroup: source.iasGroup });
    if (!initiative) {
        throw new Error(`Usage source '${source.key}': no Initiative row with iasGroup '${source.iasGroup}' - check the seed CSV`);
    }
    return initiative;
}

// Step 1: audit log -> DailyAccess for the days from..to (inclusive, UTC).
// Idempotent upsert on (person, accessDate).
async function ingest({ source, initiativeId, from, to }) {
    const { Person, DailyAccess } = cds.entities(NAMESPACE);

    const { scanned, accessEvents } = await readJouleAccess(source, from, to);

    const persons = await SELECT.from(Person).columns('scimId', 'email')
        .where({ initiative_ID: initiativeId });

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

    // Only the count is logged, never the addresses
    if (unmatched.size) {
        LOG.warn(`${source.key}: ${unmatched.size} audit-log user(s) not found in Person by email; skipped`);
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
    const { DailyAccess, ActiveUserList } = cds.entities(NAMESPACE);
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
    const { DailyAccess } = cds.entities(NAMESPACE);
    const cutoff = addDays(today, -DAILY_BUFFER_DAYS);
    const cleaned = await DELETE.from(DailyAccess)
        .where({ person_initiative_ID: initiativeId, accessDate: { '<': cutoff } });
    return { cleaned: Number(cleaned) || 0 };
}

// source = { key, iasGroup, clientId, auditLogDestination } for ONE initiative.
// daysBack is optional:
//   not given  -> yesterday only, the last complete UTC day (the daily schedule)
//   given      -> that many days up to and including today (backfill, or a quick test)
// Any failure throws, so the job is marked failed and the next run repeats the same work
// safely (everything is an upsert).
async function runPipeline({ source, daysBack }) {
    if (!source || !source.key || !source.iasGroup) {
        throw new Error('runPipeline: source needs a key and an iasGroup');
    }
    if (!source.clientId) {
        throw new Error(`Usage source '${source.key}' has no clientId (the client_id of its application in the audit log)`);
    }
    if (daysBack != null && !(Number.isInteger(daysBack) && daysBack >= 1)) {
        throw new Error('runPipeline: daysBack must be a whole number of 1 or more');
    }

    const today = toDay(new Date());
    const to = daysBack ? today : addDays(today, -1);
    const from = daysBack ? addDays(today, -(daysBack - 1)) : to;

    const initiative = await resolveInitiative(source);
    const a = await ingest({ source, initiativeId: initiative.ID, from, to });
    const b = await consolidate({ initiativeId: initiative.ID });
    const c = await cleanup({ initiativeId: initiative.ID, today });

    const result = { ...a, ...b, ...c };
    LOG.info(`${source.key}: read ${from} to ${to}`, result);
    return result;
}

module.exports = { runPipeline, resolveInitiative, ingest, consolidate, cleanup };