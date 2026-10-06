'use strict';

// Everything the J4C jobs treat as a fixed value. Nothing here is a secret.
// Values shared with other initiatives are in srv/shared/constants.js.

// The IAS group whose members are the enabled J4C users
const J4C_IAS_GROUP = 'SAP_J4C_Enduser';

module.exports = Object.freeze({
    J4C_IAS_GROUP,

    // Usage job: which audit log events count as "active in J4C"
    USAGE_SOURCE: Object.freeze({
        key: 'J4C',
        iasGroup: J4C_IAS_GROUP,
        clientId: 'sb-das-application!b170816',   // Joule application in the audit log (test subaccount)
        auditLogDestination: 'J4C_AUDITLOG'        // BTP destination with the audit log URL and login
    }),

    // Largest backfill a caller may ask for (the audit log keeps about 90 days).
    // There is no default: a call without daysBack reads yesterday, the last complete day.
    MAX_DAYS_BACK: 90,

    // DailyAccess rows older than this many days are deleted after consolidation
    DAILY_BUFFER_DAYS: 7,

    // IAS (Identity Authentication) SCIM API, read through the IAS_SCIM destination
    SCIM: Object.freeze({
        DESTINATION_NAME: 'IAS_SCIM',
        GROUPS_PATH: '/scim/Groups',
        USERS_PATH: '/scim/Users',
        ACCEPT: 'application/scim+json',
        USER_FETCH_CONCURRENCY: 5       // member profiles fetched at the same time
    }),

    // SAP Audit Log Retrieval API
    AUDIT_LOG: Object.freeze({
        API_PATH: '/auditlog/v2/auditlogrecords',
        REQUEST_TIMEOUT_MS: 30000,      // one HTTP call
        MAX_PAGES: 100,                 // safety stop: 100 pages = 50,000 records
        MAX_ATTEMPTS: 4,                // tries per page when the API answers 429 (too many requests)
        RETRY_BACKOFF_MS: 1000,         // wait attempt * this value before trying again
        PAGE_DELAY_MS: 150,             // pause between pages (rate limit is 4-8 requests per second)
        TOKEN_EVENT_PREFIX: 'TokenIssuedEvent'   // the record type that means "signed in"
    })
});