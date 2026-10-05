'use strict';

const cds = require('@sap/cds');

// ── Fiori status → criticality integer ────────────────────────────────────────
// 3 = positive (green), 2 = critical (orange), 1 = negative (red), 0 = none
const getStatusCriticality = (status) => {
  switch (status) {
    case 'Live':        return 3;
    case 'ComingSoon':  return 2;
    case 'Inactive':    return 1;
    default:            return 0;
  }
};

// ── Enabled user count ─────────────────────────────────────────────────────────
// Reads COUNT of active Person records for a given initiativeId.
// Called by both:
//   1. srv.after READ Initiatives  → populates virtual enabledUsers field
//   2. srv.on getEnabledUserCount  → serves the KPI tile function action
// Returns an integer — never returns PII, count only.
const getEnabledUserCount = async (initiativeId) => {
  const { Person } = cds.entities('ai.enablement.dashboard');

  const result = await SELECT
    .one`count(*) as cnt`
    .from(Person)
    .where({ initiative_ID: initiativeId, active: true });

  return result?.cnt ?? 0;
};

module.exports = {
  getStatusCriticality,
  getEnabledUserCount
};