'use strict';

const IAS_URL           = process.env.IAS_URL;            // e.g. https://your-tenant.accounts.ondemand.com
const IAS_CLIENT_ID     = process.env.IAS_CLIENT_ID;
const IAS_CLIENT_SECRET = process.env.IAS_CLIENT_SECRET;

let cachedToken = null; // { value, expiresAt }

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const res = await fetch(`${IAS_URL}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${IAS_CLIENT_ID}:${IAS_CLIENT_SECRET}`).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error(`IAS token request failed: ${res.status} ${await res.text()}`);

  const json = await res.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function scimGet(path) {
  const token = await getToken();
  const res = await fetch(`${IAS_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/scim+json' }
  });
  if (!res.ok) throw new Error(`SCIM GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Same output shape as the mock: [{ scimId, email, firstName, lastName, active }]
async function getGroupMembers({ iasGroup } = {}) {
  if (!IAS_URL || !IAS_CLIENT_ID || !IAS_CLIENT_SECRET) {
    throw new Error('getGroupMembers: IAS_URL / IAS_CLIENT_ID / IAS_CLIENT_SECRET are not set');
  }

  // 1. Find the group by name.
  const groupSearch = await scimGet(`/scim/Groups?filter=${encodeURIComponent(`displayName eq "${iasGroup}"`)}`);
  const group = groupSearch.Resources && groupSearch.Resources[0];
  if (!group) throw new Error(`getGroupMembers: no SCIM group found named '${iasGroup}'`);

  // 2. VERIFY against your tenant: search results sometimes truncate "members" -
  //    fetching the group by ID directly is the safe way to get the full list.
  const fullGroup = await scimGet(`/scim/Groups/${group.id}`);
  const memberIds = (fullGroup.members || []).map(m => m.value);

  // 3. Resolve each member to a full user profile.
  //    VERIFY: this is one HTTP call per user - fine at your current headcount,
  //    but if this group grows large, switch to a single filtered call instead:
  //    GET /scim/Users?filter=groups.value eq "<group.id>"  (if your tenant supports it).
  const members = [];
  for (const id of memberIds) {
    const user = await scimGet(`/scim/Users/${id}`);
    members.push({
      scimId: user.id,
      email: (user.emails && user.emails[0] && user.emails[0].value) || user.userName,
      firstName: user.name && user.name.givenName,
      lastName: user.name && user.name.familyName,
      active: user.active !== false
    });
  }

  return members;
}

module.exports = { getGroupMembers };