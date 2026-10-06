'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { STATUS, CRITICALITY } = require('../../shared/constants');
const { getStatusCriticality, getEnabledUserCount, getEnabledUserCounts } = require('../lib/dashboard-helpers');

test('getStatusCriticality maps each status to its colour', () => {
    assert.strictEqual(getStatusCriticality(STATUS.LIVE), CRITICALITY.POSITIVE);
    assert.strictEqual(getStatusCriticality(STATUS.COMING_SOON), CRITICALITY.CRITICAL);
    assert.strictEqual(getStatusCriticality(STATUS.INACTIVE), CRITICALITY.NEGATIVE);
});

test('getStatusCriticality gives no colour to unknown or missing status', () => {
    assert.strictEqual(getStatusCriticality('Draft'), CRITICALITY.NONE);
    assert.strictEqual(getStatusCriticality('constructor'), CRITICALITY.NONE);
    assert.strictEqual(getStatusCriticality(undefined), CRITICALITY.NONE);
    assert.strictEqual(getStatusCriticality(null), CRITICALITY.NONE);
});

test('the status values and criticality numbers are the ones the UI expects', () => {
    assert.deepStrictEqual({ ...STATUS }, { LIVE: 'Live', COMING_SOON: 'ComingSoon', INACTIVE: 'Inactive' });
    assert.deepStrictEqual({ ...CRITICALITY }, { NONE: 0, NEGATIVE: 1, CRITICAL: 2, POSITIVE: 3 });
});

test('counts without an initiative id need no database and give 0', async () => {
    assert.strictEqual(await getEnabledUserCount(undefined), 0);
    assert.strictEqual(await getEnabledUserCount(null), 0);
    assert.strictEqual((await getEnabledUserCounts([])).size, 0);
    assert.strictEqual((await getEnabledUserCounts(undefined)).size, 0);
    assert.strictEqual((await getEnabledUserCounts([null, ''])).size, 0);
});