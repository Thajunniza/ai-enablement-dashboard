'use strict';

// All dates are UTC calendar days in the form "YYYY-MM-DD".

function pad(n) { return String(n).padStart(2, '0'); }

function toDay(date) { return date.toISOString().slice(0, 10); }

function addDays(day, n) {
    const d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return toDay(d);
}

// ISO 8601 week label, e.g. "2026-W40". The week-year can differ from the calendar year
// around New Year (2027-01-01 belongs to 2026-W53).
function isoWeekLabel(day) {
    const d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);   // Thursday of this week
    const isoYear = d.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
    const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
    return `${isoYear}-W${pad(week)}`;
}

// The three period labels a day falls into
function labelsFor(day) {
    return {
        WEEKLY: isoWeekLabel(day),
        MONTHLY: day.slice(0, 7),     // "2026-10"
        YEARLY: day.slice(0, 4)       // "2026"
    };
}

module.exports = { toDay, addDays, isoWeekLabel, labelsFor };