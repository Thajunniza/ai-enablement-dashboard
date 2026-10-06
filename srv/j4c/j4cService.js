'use strict';
const cds = require('@sap/cds');
const { diffPersonSync } = require('./lib/enabledUsers/diffPersonSync');
const usage = require('./lib/activeUsers/usage-pipeline');
const { getGroupMembers } = require('./lib/enabledUsers/scimSource')
const { J4C_IAS_GROUP, USAGE_SOURCE, DEFAULT_DAYS_BACK, MAX_DAYS_BACK } = require('./lib/constants');

module.exports = class J4CService extends cds.ApplicationService {

  async init() {
    this.on('syncJ4CUsers', async () => {
      const db = cds.entities('ai.enablement.dashboard');

      const initiative = await SELECT.one.from(db.Initiative).where({ iasGroup: J4C_IAS_GROUP });
      if (!initiative) {
        throw new Error(`syncJ4CUsers: no Initiative row with iasGroup '${J4C_IAS_GROUP}' - check the seed CSV`);
      }

      const rawMembers = await getGroupMembers({ iasGroup: J4C_IAS_GROUP });
      const groupMembers = rawMembers.map(m => ({
        ...m,
        displayName: `${m.firstName || ''} ${m.lastName || ''}`.trim()
      }));

      const existingPersons = await SELECT.from(db.Person).where({ initiative_ID: initiative.ID });
      const now = new Date();

      const { toCreate, toReactivate, toDeactivate } =
        diffPersonSync({ groupMembers, existingPersons, now });

      if (toCreate.length) {
        await INSERT.into(db.Person).entries(
          toCreate.map(p => ({ ...p, initiative_ID: initiative.ID }))
        );
      }

      for (const p of toReactivate) {
        await UPDATE(db.Person, { scimId: p.scimId, initiative_ID: initiative.ID }).with({
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          displayName: p.displayName,
          active: true
        });
      }

      for (const p of toDeactivate) {
        await UPDATE(db.Person, { scimId: p.scimId, initiative_ID: initiative.ID }).with({ active: false });
      }

      return {
        created: toCreate.length,
        reactivated: toReactivate.length,
        deactivated: toDeactivate.length
      };
    });

    this.on('syncJ4CUsage', async (req) => {
      const n = parseInt(req.data.daysBack, 10);
      const daysBack = Math.min(Math.max(Number.isNaN(n) ? DEFAULT_DAYS_BACK : n, 1), MAX_DAYS_BACK);
      return usage.runPipeline({ source: USAGE_SOURCE, daysBack });
    });
    return super.init();
  }
};