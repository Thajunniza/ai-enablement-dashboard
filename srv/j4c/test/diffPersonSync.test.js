'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { diffPersonSync } = require('../lib/enabledUsers/diffPersonSync');

const NOW = new Date('2026-10-06T01:00:00Z');
const member = (scimId, extra = {}) => ({ scimId, email: `${scimId}@x.com`, firstName: scimId, lastName: 'L', ...extra });
const person = (scimId, active = true) => ({ scimId, active });

test('a new group member is created, active, with the sync time', () => {
    const { toCreate, toReactivate, toDeactivate } = diffPersonSync({
        groupMembers: [member('u1')],
        existingPersons: [person('u2')].concat([]),
        now: NOW
    });
    assert.strictEqual(toCreate.length, 1);
    assert.deepStrictEqual(toCreate[0], { ...member('u1'), active: true, firstSeenAt: NOW });
    assert.deepStrictEqual(toReactivate, []);
    assert.deepStrictEqual(toDeactivate, [{ scimId: 'u2' }]);
});

test('an inactive person who is back in the group is reactivated with the fresh data', () => {
    const { toCreate, toReactivate, toDeactivate } = diffPersonSync({
        groupMembers: [member('u1', { email: 'new@x.com' })],
        existingPersons: [person('u1', false)]
    });
    assert.deepStrictEqual(toCreate, []);
    assert.deepStrictEqual(toDeactivate, []);
    assert.strictEqual(toReactivate.length, 1);
    assert.strictEqual(toReactivate[0].email, 'new@x.com');
    assert.strictEqual(toReactivate[0].active, true);
});

test('people who are active and still in the group need nothing', () => {
    const result = diffPersonSync({ groupMembers: [member('u1'), member('u2')], existingPersons: [person('u1'), person('u2')] });
    assert.deepStrictEqual(result, { toCreate: [], toReactivate: [], toDeactivate: [] });
});

test('an inactive person who is not in the group stays as they are', () => {
    const result = diffPersonSync({ groupMembers: [member('u1')], existingPersons: [person('u1'), person('u9', false)] });
    assert.deepStrictEqual(result.toDeactivate, []);
});

test('a member marked inactive in IAS counts as not in the group', () => {
    const { toCreate, toDeactivate } = diffPersonSync({
        groupMembers: [member('u1'), member('u2', { active: false })],
        existingPersons: [person('u2')]
    });
    assert.deepStrictEqual(toCreate.map((p) => p.scimId), ['u1']);
    assert.deepStrictEqual(toDeactivate, [{ scimId: 'u2' }]);
});

test('the same member twice (overlapping SCIM pages) is created once', () => {
    const { toCreate } = diffPersonSync({ groupMembers: [member('u1'), member('u1')], existingPersons: [] });
    assert.strictEqual(toCreate.length, 1);
});

test('members without an id are skipped', () => {
    const { toCreate } = diffPersonSync({ groupMembers: [member('u1'), { email: 'x@x.com' }, null], existingPersons: [] });
    assert.deepStrictEqual(toCreate.map((p) => p.scimId), ['u1']);
});

test('an empty group never switches off everybody', () => {
    assert.throws(
        () => diffPersonSync({ groupMembers: [], existingPersons: [person('u1'), person('u2')] }),
        /refusing to deactivate everyone/
    );
});

test('an empty group is fine when nobody is active', () => {
    assert.deepStrictEqual(
        diffPersonSync({ groupMembers: [], existingPersons: [person('u1', false)] }),
        { toCreate: [], toReactivate: [], toDeactivate: [] }
    );
    assert.deepStrictEqual(diffPersonSync(), { toCreate: [], toReactivate: [], toDeactivate: [] });
});