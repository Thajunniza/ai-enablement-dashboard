const cds = require('@sap/cds');
const { getStatusCriticality, getEnabledUserCount } = require('./lib/dashboard-helpers');
const db = cds.entities('ai.enablement.dashboard');

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
            const { initiativeId } = req.data;
            if (grain && !VALID_GRAINS.includes(grain)) {
                return req.reject(400, `Invalid grain: ${req.data.grain}. Must be WEEKLY, MONTHLY or YEARLY.`);
            }

            const { ActiveUserList } = cds.entities('ai.enablement.dashboard');

            const where = {};
            if (grain) where.grain = grain;
            if (initiativeId) where.person_initiative_ID = initiativeId;

            const query = SELECT.from(ActiveUserList)
                .columns('periodLabel', 'grain', 'count(1) as activeCount')
                .groupBy('periodLabel', 'grain')
                .orderBy('grain', 'periodLabel');

            if (Object.keys(where).length) query.where(where);

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

        this.on('resetData', async () => {

            // order matters: DailyAccess and ActiveUserList point to Person, and Person points to Initiative
            const d = await DELETE.from(db.DailyAccess);
            const a = await DELETE.from(db.ActiveUserList);
            const p = await DELETE.from(db.Person);
            const i = await DELETE.from(db.Initiative);

            return {
                dailyAccess: Number(d) || 0,
                activeUsers: Number(a) || 0,
                persons: Number(p) || 0,
                initiatives: Number(i) || 0
            };
        });
        return super.init();
    }
};