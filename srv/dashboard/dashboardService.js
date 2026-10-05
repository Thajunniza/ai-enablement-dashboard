const cds = require('@sap/cds');
const { getStatusCriticality, getEnabledUserCount } = require('./lib/dashboard-helpers');

module.exports = class DashboardService extends cds.ApplicationService {
    async init() {

        const { ActiveUserList } = cds.entities('ai.enablement.dashboard');

        // ── Virtual fields — after READ Initiatives ───────────────────────────────
        // Calls shared getEnabledUserCount helper — same function used by KPI action
        this.after('READ', 'Initiatives', async (initiatives) => {
            if (!initiatives || initiatives.length === 0) return;

            const rows = Array.isArray(initiatives) ? initiatives : [initiatives];

            for (const initiative of rows) {
                // Shared helper — no duplicate DB query logic
                initiative.enabledUsers = await getEnabledUserCount(initiative.ID);
                initiative.statusCriticality = getStatusCriticality(initiative.status);
            }
        });

        const VALID_GRAINS = ['WEEKLY', 'MONTHLY', 'YEARLY'];

        this.on('getTrendCounts', async (req) => {
            const grain = req.data.grain?.toUpperCase();
            if (grain && !VALID_GRAINS.includes(grain)) {
                return req.reject(400, `Invalid grain: ${req.data.grain}. Must be WEEKLY, MONTHLY or YEARLY.`);
            }

            const { ActiveUserList } = cds.entities('ai.enablement.dashboard');

            const query = SELECT.from(ActiveUserList)
                .columns('periodLabel', 'grain', 'count(1) as activeCount') // or count(distinct userId)
                .groupBy('periodLabel', 'grain')
                .orderBy('grain', 'periodLabel'); // ideally a periodStart date column

            if (grain) query.where({ grain });

            const rows = await cds.run(query);

            return rows.map(r => ({
                periodLabel: r.periodLabel,
                grain: r.grain,
                activeCount: Number(r.activeCount)
            }));
        });

        // ── getEnabledUserCount — KPI tile function action ────────────────────────
        // Delegates entirely to shared helper — zero duplication
        this.on('getEnabledUserCount', async (req) => {
            const { initiativeId } = req.data;

            if (!initiativeId) {
                return req.error(400, 'initiativeId is required.');
            }

            const count = await getEnabledUserCount(initiativeId);
            return { count };
        });

        return super.init();
    }
};