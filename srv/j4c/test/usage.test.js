'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isoWeekLabel, labelsFor, addDays } = require('../../shared/period-labels')
const { aggregate, mergeRoster } = require('../../shared/roster')
const { extractAccess } = require('../lib/activeUsers/audit-log-reader')

const DAS = 'sb-das-application!b170816';

function rec(user, time, text) {
    const data = JSON.stringify({ message: text });
    return { time, user, message: JSON.stringify({ user, time, data }) };
}
const token = (client, email) =>
    `TokenIssuedEvent ('{"sub":"x","user_name":"${email}","client_id":"${client}","aud":["a"]}'): principal=x, origin=[caller=null]`;

test('ISO week labels', () => {
    assert.strictEqual(isoWeekLabel('2026-09-21'), '2026-W39');
    assert.strictEqual(isoWeekLabel('2026-09-28'), '2026-W40');
    assert.strictEqual(isoWeekLabel('2026-10-01'), '2026-W40');
    assert.strictEqual(isoWeekLabel('2026-10-04'), '2026-W40');
    assert.strictEqual(isoWeekLabel('2026-10-05'), '2026-W41');
    assert.strictEqual(isoWeekLabel('2027-01-01'), '2026-W53');
    assert.strictEqual(isoWeekLabel('2024-12-30'), '2025-W01');
    assert.deepStrictEqual(labelsFor('2026-10-01'), { WEEKLY: '2026-W40', MONTHLY: '2026-10', YEARLY: '2026' });
});

test('only token events for the Joule client count', () => {
    const ok = rec('Robert.Maloney@Aptiv.com', '2026-09-29T08:00:00.000Z', token(DAS, 'Robert.Maloney@aptiv.com'));
    assert.deepStrictEqual(extractAccess(ok, DAS), { email: 'robert.maloney@aptiv.com', date: '2026-09-29' });
    assert.strictEqual(extractAccess(rec('u@x.com', '2026-09-29T08:00:00Z', token('sb-other!b1', 'u@x.com')), DAS), null);
    assert.strictEqual(extractAccess(rec('UNKNOWN_USER', '2026-09-29T08:00:00Z', "ClientAuthenticationFailure ('Bad credentials'): principal=x"), DAS), null);
    assert.strictEqual(extractAccess(rec(DAS, '2026-09-29T08:00:00Z', "UserAuthenticationSuccess ('u@x.com'): principal=x"), DAS), null);
    assert.strictEqual(extractAccess({ time: '2026-09-29T08:00:00Z', message: 'not json' }, DAS), null);
});

test('aggregate: one entry per grain, period and person with min/max day', () => {
    const p = { person_scimId: 's1', person_initiative_ID: 'i1' };
    const agg = aggregate([
        { ...p, accessDate: '2026-09-28' }, { ...p, accessDate: '2026-10-01' }, { ...p, accessDate: '2026-09-29' }
    ]);
    const get = (g, l) => agg.get([g, l, 's1', 'i1'].join('|'));
    assert.deepStrictEqual([get('WEEKLY', '2026-W40').firstSeen, get('WEEKLY', '2026-W40').lastSeen], ['2026-09-28', '2026-10-01']);
    assert.deepStrictEqual([get('MONTHLY', '2026-09').firstSeen, get('MONTHLY', '2026-09').lastSeen], ['2026-09-28', '2026-09-29']);
    assert.deepStrictEqual([get('MONTHLY', '2026-10').firstSeen, get('MONTHLY', '2026-10').lastSeen], ['2026-10-01', '2026-10-01']);
    assert.strictEqual(get('YEARLY', '2026').firstSeen, '2026-09-28');
    assert.strictEqual(agg.size, 4);
});

test('merge keeps older firstSeen and newer lastSeen, and is idempotent', () => {
    const p = { person_scimId: 's1', person_initiative_ID: 'i1' };
    const existing = [{ ...p, grain: 'MONTHLY', periodLabel: '2026-09', firstSeen: '2026-09-05', lastSeen: '2026-09-20' }];
    const agg = aggregate([{ ...p, accessDate: '2026-09-28' }]);
    const once = mergeRoster(agg, existing).find((r) => r.grain === 'MONTHLY');
    assert.deepStrictEqual([once.firstSeen, once.lastSeen], ['2026-09-05', '2026-09-28']);
    const again = mergeRoster(agg, [once]).find((r) => r.grain === 'MONTHLY');
    assert.deepStrictEqual(again, once);
});

test('7-day buffer always covers the current ISO week', () => {
    for (let i = 0; i < 14; i++) {
        const today = addDays('2026-09-28', i);
        const cutoff = addDays(today, -7);
        const monday = addDays(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7));
        assert.ok(monday >= cutoff, `week start ${monday} would be deleted on ${today}`);
    }
});