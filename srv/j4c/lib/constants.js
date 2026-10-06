'use strict';

const J4C_IAS_GROUP = 'SAP_J4C_Enduser';

module.exports = {
    J4C_IAS_GROUP,

    // Everything the usage job needs to know about J4C
    USAGE_SOURCE: Object.freeze({
        key: 'J4C',
        iasGroup: J4C_IAS_GROUP,
        clientId: 'sb-das-application!b170816',   // Joule application in the audit log (test subaccount)
        auditLogDestination: 'J4C_AUDITLOG'
    }),

    // How far back the usage job reads
    DEFAULT_DAYS_BACK: 1,
    MAX_DAYS_BACK: 90
};