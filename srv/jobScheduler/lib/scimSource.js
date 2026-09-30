'use strict';
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { getDestination }     = require('@sap-cloud-sdk/connectivity');

async function scimGet(path) {
  const res = await executeHttpRequest(
    { destinationName: 'IAS_SCIM' },
    {
      method: 'GET',
      url: path,
      headers: { Accept: 'application/scim+json' }
    }
  );
  return res.data;
}

// Same output shape as the mock: [{ scimId, email, firstName, lastName, active }]
// Returns REAL identity fields - this project keeps real PII on Person and masks
// it at read time in dashboardService.js based on role (DashboardViewer sees
// masked, DashboardUserDetail sees real). No anonymization happens here.
async function getGroupMembers({ iasGroup } = {}) {
  const dest = await getDestination({ destinationName: 'IAS_SCIM' });
  if (!dest) throw new Error('getGroupMembers: IAS_SCIM destination not resolved - check BTP cockpit and cds bind');

  // 1. Find the group by displayName.
  const groupSearch = await scimGet(
    `/scim/Groups?filter=${encodeURIComponent(`displayName eq "${iasGroup}"`)}`
  );
  const group = groupSearch.Resources?.[0];
  if (!group) throw new Error(`getGroupMembers: no SCIM group found named '${iasGroup}'`);

  // 2. VERIFY against your tenant: fetch the group by ID directly - search
  //    results sometimes truncate the members array.
  const fullGroup = await scimGet(`/scim/Groups/${group.id}`);
  const memberIds = (fullGroup.members || []).map(m => m.value);

  // 3. Resolve each member to a full profile.
  //    VERIFY: one call per user - fine at current headcount, switch to
  //    GET /scim/Users?filter=groups.value eq "<group.id>" if this grows large.
  const members = [];
  for (const id of memberIds) {
    const user = await scimGet(`/scim/Users/${id}`);
    members.push({
      scimId:    user.id,
      email:     user.emails?.[0]?.value || user.userName,
      firstName: user.name?.givenName,
      lastName:  user.name?.familyName,
      active:    user.active !== false
    });
  }
  return members;
}

module.exports = { getGroupMembers };