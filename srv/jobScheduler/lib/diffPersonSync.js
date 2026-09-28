'use strict';

function diffPersonSync({ groupMembers = [], existingPersons = [], now = new Date() } = {}) {
  const activeMembers    = groupMembers.filter(m => m.active !== false);
  const memberByScimId   = new Map(activeMembers.map(m => [m.scimId, m]));
  const existingByScimId = new Map(existingPersons.map(p => [p.scimId, p]));

  const toCreate = [], toReactivate = [], toDeactivate = [];

  for (const m of activeMembers) {
    const existing = existingByScimId.get(m.scimId);
    if (!existing) {
      toCreate.push({ ...m, active: true, firstSeenAt: now });
    } else if (existing.active === false) {
      toReactivate.push({ ...m, active: true });
    }
    // else: already active and still a member - nothing for the SCIM job to do.
    // lastSeenAt/usage-related fields are owned by the audit-log job, not this one.
  }

  for (const p of existingPersons) {
    if (p.active !== false && !memberByScimId.has(p.scimId)) {
      toDeactivate.push({ scimId: p.scimId });
    }
  }

  return { toCreate, toReactivate, toDeactivate };
}

module.exports = { diffPersonSync };