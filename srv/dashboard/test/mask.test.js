'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { maskName, maskEmail, maskPerson } = require('../lib/mask');

test('maskName keeps only the first letter of each word', () => {
    assert.strictEqual(maskName('Jane Doe'), 'J*** D***');
    assert.strictEqual(maskName('  Jane   Doe '), 'J*** D***');
    assert.strictEqual(maskName(''), '');
    assert.strictEqual(maskName(null), null);
});

test('maskEmail keeps the first letter and the domain', () => {
    assert.strictEqual(maskEmail('jane.doe@example.com'), 'j***@example.com');
    assert.strictEqual(maskEmail('not-an-email'), 'n***');
    assert.strictEqual(maskEmail(undefined), undefined);
});

test('maskPerson masks names and email but keeps ids and flags', () => {
    const person = {
        scimId: 'abc-123',
        displayName: 'Jane Doe',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.com',
        active: true
    };
    maskPerson(person);
    assert.deepStrictEqual(person, {
        scimId: 'abc-123',
        displayName: 'J*** D***',
        firstName: 'J***',
        lastName: 'D***',
        email: 'j***@example.com',
        active: true
    });
});

test('maskPerson ignores missing values', () => {
    assert.strictEqual(maskPerson(undefined), undefined);
    assert.strictEqual(maskPerson(5), 5);
    assert.deepStrictEqual(maskPerson({ scimId: 'x' }), { scimId: 'x' });
});