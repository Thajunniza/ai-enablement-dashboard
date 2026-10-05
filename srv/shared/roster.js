'use strict';

const { labelsFor } = require('./period-labels');

const GRAINS = ['WEEKLY', 'MONTHLY', 'YEARLY'];

function key(grain, periodLabel, scimId, initiativeId) {
    return [grain, periodLabel, scimId, initiativeId].join('|');
}

// DailyAccess rows -> one entry per (grain, period, person) with min/max day
function aggregate(dailyRows) {
    const out = new Map();
    for (const row of dailyRows) {
        const day = String(row.accessDate).slice(0, 10);
        const labels = labelsFor(day);
        for (const grain of GRAINS) {
            const k = key(grain, labels[grain], row.person_scimId, row.person_initiative_ID);
            const cur = out.get(k);
            if (!cur) {
                out.set(k, {
                    periodLabel: labels[grain],
                    grain,
                    person_scimId: row.person_scimId,
                    person_initiative_ID: row.person_initiative_ID,
                    firstSeen: day,
                    lastSeen: day
                });
            } else {
                if (day < cur.firstSeen) cur.firstSeen = day;
                if (day > cur.lastSeen) cur.lastSeen = day;
            }
        }
    }
    return out;
}

// Merge new aggregates into rows that already exist, never overwrite.
// DailyAccess only holds ~7 days, so for MONTHLY and YEARLY the stored firstSeen/lastSeen
// reach further back than the buffer. min/max keeps them and makes re-runs idempotent.
function mergeRoster(aggregated, existingRows) {
    const existing = new Map();
    for (const e of existingRows) {
        existing.set(key(e.grain, e.periodLabel, e.person_scimId, e.person_initiative_ID), e);
    }
    const merged = [];
    for (const [k, row] of aggregated) {
        const old = existing.get(k);
        const oldFirst = old && old.firstSeen ? String(old.firstSeen).slice(0, 10) : null;
        const oldLast = old && old.lastSeen ? String(old.lastSeen).slice(0, 10) : null;
        merged.push({
            ...row,
            firstSeen: oldFirst && oldFirst < row.firstSeen ? oldFirst : row.firstSeen,
            lastSeen: oldLast && oldLast > row.lastSeen ? oldLast : row.lastSeen
        });
    }
    return merged;
}

module.exports = { GRAINS, aggregate, mergeRoster };