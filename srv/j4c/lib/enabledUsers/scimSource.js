'use strict';

const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { getDestination } = require('@sap-cloud-sdk/connectivity');
const { SCIM } = require('../constants');

// Runs fn over all items, at most `limit` at a time. The results keep the order of the items.
async function mapWithLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

// Reads the members of one IAS group through the SCIM API (destination IAS_SCIM).
// Returns [{ scimId, email, firstName, lastName, active }] with the real identity fields.
// The project keeps real data on Person and masks it when it is read, by role
// (see dashboardService.js); nothing is anonymised here.
async function getGroupMembers({ iasGroup } = {}) {
    if (!iasGroup) throw new Error('getGroupMembers: iasGroup is required');

    // Resolved once, so the Destination service is not asked again for every call
    const destination = await getDestination({ destinationName: SCIM.DESTINATION_NAME });
    if (!destination) {
        throw new Error(`getGroupMembers: destination '${SCIM.DESTINATION_NAME}' not found - check the BTP cockpit`);
    }
    const get = async (path) => {
        const res = await executeHttpRequest(destination, {
            method: 'GET',
            url: path,
            headers: { Accept: SCIM.ACCEPT }
        });
        return res.data;
    };

    // 1. Find the group by its name
    const filter = `displayName eq "${String(iasGroup).replace(/"/g, '\\"')}"`;
    const search = await get(`${SCIM.GROUPS_PATH}?filter=${encodeURIComponent(filter)}`);
    const group = search.Resources?.[0];
    if (!group) throw new Error(`getGroupMembers: no SCIM group found named '${iasGroup}'`);

    // 2. Read the group itself, because a search result can cut the member list short
    const fullGroup = await get(`${SCIM.GROUPS_PATH}/${group.id}`);
    const memberIds = (fullGroup.members || [])
        .filter((m) => (m.type || 'User') === 'User')     // skip nested groups
        .map((m) => m.value);

    // 3. One call per member for the full profile, a few at a time
    return mapWithLimit(memberIds, SCIM.USER_FETCH_CONCURRENCY, async (id) => {
        const user = await get(`${SCIM.USERS_PATH}/${id}`);
        return {
            scimId: user.id,
            email: user.emails?.[0]?.value || user.userName,
            firstName: user.name?.givenName,
            lastName: user.name?.familyName,
            active: user.active !== false
        };
    });
}

module.exports = { getGroupMembers };