'use strict';

const cds = require('@sap/cds');
const { getStatusCriticality, getEnabledUserCount, getEnabledUserCounts } = require('./lib/dashboard-helpers');
const { maskPerson } = require('./lib/mask');
const { NAMESPACE, ROLES } = require('../shared/constants');
const { GRAINS } = require('../shared/roster');

module.exports = class DashboardService extends cds.ApplicationService {
    async init() {
        const { ActiveUserList } = cds.entities(NAMESPACE);

        // ── Initiatives: computed fields ──────────────────────────────────────────
        this.after('READ', 'Initiatives', async (initiatives) => {
            const rows = [].concat(initiatives || []);
            const counts = await getEnabledUserCounts(rows.map((row) => row.ID));   // one query for all
            for (const initiative of rows) {
                initiative.enabledUsers = counts.get(initiative.ID) ?? 0;
                initiative.statusCriticality = getStatusCriticality(initiative.status);
            }
        });

        // ── Masking: real names and emails only for DashboardUserDetail ───────────
        this.after('READ', 'Persons', (rows, req) => {
            if (req.user.is(ROLES.USER_DETAIL)) return;
            [].concat(rows || []).forEach(maskPerson);
        });

        // ActiveUsers rows can carry the person (via $expand=person), so mask that too.
        this.after('READ', 'ActiveUsers', (rows, req) => {
            if (req.user.is(ROLES.USER_DETAIL)) return;
            [].concat(rows || []).forEach((row) => row && maskPerson(row.person));
        });

        // ── Trend chart: distinct active users per period ─────────────────────────
        this.on('getTrendCounts', async (req) => {
            const grain = req.data.grain?.toUpperCase();
            const { initiativeId } = req.data;
            if (grain && !GRAINS.includes(grain)) {
                return req.reject(400, `Invalid grain: ${req.data.grain}. Must be ${GRAINS.join(', ')}.`);
            }

            const where = {};
            if (grain) where.grain = grain;
            if (initiativeId) where.person_initiative_ID = initiativeId;

            const query = SELECT.from(ActiveUserList)
                .columns('periodLabel', 'grain', 'count(1) as activeCount')
                .groupBy('periodLabel', 'grain')
                .orderBy('grain', 'periodLabel');
            if (Object.keys(where).length) query.where(where);

            const rows = await cds.run(query);
            return rows.map((r) => ({
                periodLabel: r.periodLabel,
                grain: r.grain,
                activeCount: Number(r.activeCount)
            }));
        });

        // ── KPI tile: number of enabled users of one initiative ───────────────────
        this.on('getEnabledUserCount', async (req) => {
            const { initiativeId } = req.data;
            if (!initiativeId) return req.reject(400, 'initiativeId is required.');
            return { count: await getEnabledUserCount(initiativeId) };
        });

        return super.init();
    }
};