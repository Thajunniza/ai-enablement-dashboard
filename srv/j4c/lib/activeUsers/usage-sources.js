'use strict';

// One entry per initiative whose usage comes from an SAP Audit Log (the log of the
// subaccount that hosts the initiative's app).
//
// J4C: the Joule subaccount's audit log only holds XSUAA security events. A user counts as
// "active on a day" when a TokenIssuedEvent was issued to the Joule (Digital Assistant)
// application's client for that user. clientId is the `client_id` inside those events; it is
// specific to the subaccount, so set it per environment.
module.exports = function sources() {
    const sources = [];
    if (process.env.J4C_INITIATIVE_ID) {
        if (!process.env.J4C_DAS_CLIENT_ID) {
            throw new Error('J4C_DAS_CLIENT_ID is not set (the client_id of the Joule application in TokenIssuedEvent entries).');
        }
        sources.push({
            key: 'J4C',
            initiativeId: process.env.J4C_INITIATIVE_ID,
            clientId: process.env.J4C_DAS_CLIENT_ID
        });
    }
    if (!sources.length) {
        throw new Error('No usage sources configured. Set J4C_INITIATIVE_ID and J4C_DAS_CLIENT_ID.');
    }
    return sources;
};