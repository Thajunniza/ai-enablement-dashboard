'use strict';

const cds = require('@sap/cds');
const { NAMESPACE, STATUS, CRITICALITY } = require('../../shared/constants');

const { SELECT } = cds.ql;

// ── Fiori status → criticality ────────────────────────────────────────────────
// Live = green, ComingSoon = orange, Inactive = red, anything else = no colour.
const CRITICALITY_BY_STATUS = new Map([
    [STATUS.LIVE, CRITICALITY.POSITIVE],
    [STATUS.COMING_SOON, CRITICALITY.CRITICAL],
    [STATUS.INACTIVE, CRITICALITY.NEGATIVE]
]);

const getStatusCriticality = (status) => CRITICALITY_BY_STATUS.get(status) ?? CRITICALITY.NONE;

// ── Enabled user counts ───────────────────────────────────────────────────────
// Number of active Person records per initiative, for any number of initiatives,
// in one query. Returns a Map(initiativeId -> count); every requested id is in it,
// with 0 when the initiative has no active person. Counts only, never personal data.
const getEnabledUserCounts = async (initiativeIds) => {
    const ids = [...new Set((initiativeIds || []).filter(Boolean))];
    const counts = new Map(ids.map((id) => [id, 0]));
    if (!ids.length) return counts;

    const { Person } = cds.entities(NAMESPACE);
    const rows = await SELECT.from(Person)
        .columns('initiative_ID', 'count(*) as cnt')
        .where({ initiative_ID: { in: ids }, active: true })
        .groupBy('initiative_ID');

    // Number(): PostgreSQL can return a count as a string
    for (const row of rows) counts.set(row.initiative_ID, Number(row.cnt));
    return counts;
};

// The same count for a single initiative (KPI tile).
const getEnabledUserCount = async (initiativeId) => {
    if (!initiativeId) return 0;
    const counts = await getEnabledUserCounts([initiativeId]);
    return counts.get(initiativeId) ?? 0;
};

module.exports = {
    getStatusCriticality,
    getEnabledUserCount,
    getEnabledUserCounts
};