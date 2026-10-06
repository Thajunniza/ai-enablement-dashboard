'use strict';

// Runs the SCIM reader against a fake Destination service and a fake SCIM server. No network.

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const GROUP_ID = 'g-1';
const state = { users: {}, members: [], destination: { url: 'https://ias.example' }, inFlight: 0, maxInFlight: 0, urls: [] };

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === '@sap-cloud-sdk/connectivity') {
        return { getDestination: async () => state.destination };
    }
    if (request === '@sap-cloud-sdk/http-client') {
        return {
            executeHttpRequest: async (destination, config) => {
                assert.strictEqual(destination, state.destination, 'the resolved destination is reused');
                state.urls.push(config.url);
                state.inFlight++;
                state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
                await new Promise((r) => setImmediate(r));          // lets parallel calls overlap
                state.inFlight--;

                if (config.url.startsWith('/scim/Groups?filter=')) {
                    return { data: state.groupFound === false ? { Resources: [] } : { Resources: [{ id: GROUP_ID }] } };
                }
                if (config.url === `/scim/Groups/${GROUP_ID}`) return { data: { members: state.members } };
                const id = config.url.replace('/scim/Users/', '');
                return { data: state.users[id] };
            }
        };
    }
    return originalLoad.call(this, request, ...rest);
};

const { getGroupMembers } = require('../lib/enabledUsers/scimSource');
const { SCIM } = require('../lib/constants');

const user = (id, extra = {}) => ({
    id, userName: `${id}@login.example`, emails: [{ value: `${id}@x.com` }],
    name: { givenName: `G${id}`, familyName: `F${id}` }, active: true, ...extra
});

function reset(ids) {
    state.users = Object.fromEntries(ids.map((id) => [id, user(id)]));
    state.members = ids.map((id) => ({ value: id }));
    state.destination = { url: 'https://ias.example' };
    state.groupFound = true;
    state.inFlight = 0; state.maxInFlight = 0; state.urls = [];
}

test('returns the members with the fields the sync needs, in group order', async () => {
    reset(['u1', 'u2', 'u3']);
    const members = await getGroupMembers({ iasGroup: 'SAP_X' });
    assert.deepStrictEqual(members.map((m) => m.scimId), ['u1', 'u2', 'u3']);
    assert.deepStrictEqual(members[0], { scimId: 'u1', email: 'u1@x.com', firstName: 'Gu1', lastName: 'Fu1', active: true });
    assert.ok(state.urls[0].includes(encodeURIComponent('displayName eq "SAP_X"')));
});

test('falls back to the user name when there is no email, and keeps inactive users marked', async () => {
    reset(['u1']);
    state.users.u1 = user('u1', { emails: undefined, active: false });
    const [m] = await getGroupMembers({ iasGroup: 'SAP_X' });
    assert.strictEqual(m.email, 'u1@login.example');
    assert.strictEqual(m.active, false);
});

test('fetches several profiles at once, but never more than the limit', async () => {
    reset(Array.from({ length: 20 }, (_, i) => `u${i}`));
    const members = await getGroupMembers({ iasGroup: 'SAP_X' });
    assert.strictEqual(members.length, 20);
    assert.ok(state.maxInFlight > 1, 'runs in parallel');
    assert.ok(state.maxInFlight <= SCIM.USER_FETCH_CONCURRENCY, 'stays within the limit');
});

test('nested groups are skipped', async () => {
    reset(['u1']);
    state.members.push({ value: 'g-nested', type: 'Group' });
    const members = await getGroupMembers({ iasGroup: 'SAP_X' });
    assert.deepStrictEqual(members.map((m) => m.scimId), ['u1']);
});

test('an empty group gives an empty list', async () => {
    reset([]);
    assert.deepStrictEqual(await getGroupMembers({ iasGroup: 'SAP_X' }), []);
});

test('clear errors for a missing group, destination or group name', async () => {
    reset(['u1']);
    state.groupFound = false;
    await assert.rejects(getGroupMembers({ iasGroup: 'NOPE' }), /no SCIM group found named 'NOPE'/);

    reset(['u1']);
    state.destination = undefined;
    await assert.rejects(getGroupMembers({ iasGroup: 'SAP_X' }), /destination 'IAS_SCIM' not found/);

    await assert.rejects(getGroupMembers({}), /iasGroup is required/);
});