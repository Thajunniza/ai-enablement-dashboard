'use strict';

// Compares the members of the IAS group (read through SCIM) with the Person rows of one
// initiative and says what the SCIM job has to do. Pure function: no database, no network.
//
//   toCreate      group members that have no Person row yet
//   toReactivate  group members whose Person row is inactive
//   toDeactivate  active Person rows whose person left the group (only { scimId })
//
// Usage fields are not touched here; the usage job owns them.
function diffPersonSync({ groupMembers = [], existingPersons = [], now = new Date() } = {}) {
    // A member without an id cannot be matched, and the same id twice (for example when two
    // SCIM pages overlap) counts once. Members marked inactive in IAS count as not in the group.
    const memberByScimId = new Map();
    for (const m of groupMembers) {
        if (m && m.scimId && m.active !== false) memberByScimId.set(m.scimId, m);
    }
    const existingByScimId = new Map(existingPersons.map((p) => [p.scimId, p]));

    // Safety stop: an empty answer from SCIM (a failed call, a missing permission) must not
    // switch off every enabled user. A group that really is empty needs a person to look at it.
    const hasActivePersons = existingPersons.some((p) => p.active !== false);
    if (memberByScimId.size === 0 && hasActivePersons) {
        throw new Error(
            'diffPersonSync: the group has no active members but active persons exist; ' +
            'refusing to deactivate everyone (check the SCIM call)'
        );
    }

    const toCreate = [];
    const toReactivate = [];
    const toDeactivate = [];

    for (const m of memberByScimId.values()) {
        const existing = existingByScimId.get(m.scimId);
        if (!existing) {
            toCreate.push({ ...m, active: true, firstSeenAt: now });
        } else if (existing.active === false) {
            toReactivate.push({ ...m, active: true });
        }
        // else: already active and still a member, nothing to do
    }

    for (const p of existingPersons) {
        if (p.active !== false && !memberByScimId.has(p.scimId)) {
            toDeactivate.push({ scimId: p.scimId });
        }
    }

    return { toCreate, toReactivate, toDeactivate };
}

module.exports = { diffPersonSync };