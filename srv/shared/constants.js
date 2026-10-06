'use strict';

// Values shared by every initiative and by the dashboard service.
// Initiative-specific values live in that initiative's own constants file
// (for J4C: srv/j4c/lib/constants.js).
//
// The grain list (WEEKLY, MONTHLY, YEARLY) lives in roster.js as GRAINS.
//
// Not here, because they cannot import JavaScript:
//   - CDS annotations such as @path and @requires
//   - xs-security.json and mta.yaml
// Keep the role names below identical to the scopes in xs-security.json.

module.exports = Object.freeze({
    // CDS namespace of the data model (db/schema.cds)
    NAMESPACE: 'ai.enablement.dashboard',

    // Initiative status values (the Status column of Initiative)
    STATUS: Object.freeze({
        LIVE: 'Live',
        COMING_SOON: 'ComingSoon',
        INACTIVE: 'Inactive'
    }),

    // Fiori criticality numbers used for the coloured status pills
    CRITICALITY: Object.freeze({
        NONE: 0,
        NEGATIVE: 1,    // red
        CRITICAL: 2,    // orange
        POSITIVE: 3     // green
    }),

    // Role names as CAP sees them (the scope name without the app prefix)
    ROLES: Object.freeze({
        VIEWER: 'DashboardViewer',
        USER_DETAIL: 'DashboardUserDetail',
        ADMIN: 'DashboardAdmin',
        JOB_SCHEDULER: 'JobScheduler'
    })
});