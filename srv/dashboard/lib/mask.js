'use strict';

// Masking for personal data. Used by the dashboard service for every user
// who does not have the DashboardUserDetail scope.

const NAME_FIELDS = ['displayName', 'firstName', 'lastName'];

// "Jane Doe" -> "J*** D***"
function maskName(value) {
    if (!value) return value;
    return String(value)
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word[0] + '***')
        .join(' ');
}

// "jane.doe@example.com" -> "j***@example.com"
function maskEmail(value) {
    if (!value) return value;
    const text = String(value);
    const at = text.indexOf('@');
    return at > 0 ? text[0] + '***' + text.slice(at) : text[0] + '***';
}

// Masks a person object in place and returns it. scimId stays as it is,
// because the screens use it to navigate and it is not readable by itself.
function maskPerson(person) {
    if (!person || typeof person !== 'object') return person;
    for (const field of NAME_FIELDS) {
        if (person[field]) person[field] = maskName(person[field]);
    }
    if (person.email) person.email = maskEmail(person.email);
    return person;
}

module.exports = { maskName, maskEmail, maskPerson };