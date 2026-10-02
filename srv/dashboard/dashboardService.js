const cds = require('@sap/cds');

module.exports = class DashboardService extends cds.ApplicationService {
    async init() {

        // enabledUsers virtual field — count active persons per initiative
        this.after('READ', 'Initiatives', async (initiatives) => {
            const rows = Array.isArray(initiatives) ? initiatives : [initiatives];
            for (const initiative of rows) {
                const result = await SELECT.one
                    .from('ai.enablement.dashboard.Person')
                    .columns('count(*) as count')
                    .where({ initiative_ID: initiative.ID, active: true });
                initiative.enabledUsers = result?.count ?? 0;
                initiative.statusCriticality = initiative.status === 'Live' ? 3 : 0;
            }
        });

        // DashboardViewer masking — first initial + last name, masked email
        this.after('READ', 'PersonsMasked', (persons) => {
            const rows = Array.isArray(persons) ? persons : [persons];
            for (const person of rows) {
                // Mask name: "Bin Jiang" → "B. Jiang"
                if (person.firstName && person.lastName) {
                    person.firstName = `${person.firstName.charAt(0)}.`;
                }
                // Mask email: "bin.jiang@aptiv.com" → "b***@aptiv.com"
                if (person.email) {
                    const [local, domain] = person.email.split('@');
                    person.email = `${local.charAt(0)}***@${domain}`;
                }
            }
        });

        return super.init();
    }
};