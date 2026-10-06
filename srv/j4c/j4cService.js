'use strict';

const cds = require('@sap/cds');
const { diffPersonSync } = require('./lib/enabledUsers/diffPersonSync');
const { getGroupMembers } = require('./lib/enabledUsers/scimSource');
const usage = require('./lib/activeUsers/usage-pipeline');
const { NAMESPACE } = require('../shared/constants');
const { J4C_IAS_GROUP, USAGE_SOURCE, MAX_DAYS_BACK } = require('./lib/constants');

const LOG = cds.log('j4c');

module.exports = class J4CService extends cds.ApplicationService {

    async init() {
        const db = cds.entities(NAMESPACE);

        // ── Job 1: enabled users (SCIM) ───────────────────────────────────────────
        // Compares the members of the J4C IAS group with the Person table and
        // creates, reactivates or deactivates rows.
        this.on('syncJ4CUsers', async () => {
            const initiative = await SELECT.one.from(db.Initiative).where({ iasGroup: J4C_IAS_GROUP });
            if (!initiative) {
                throw new Error(`syncJ4CUsers: no Initiative row with iasGroup '${J4C_IAS_GROUP}' - check the seed CSV`);
            }

            const rawMembers = await getGroupMembers({ iasGroup: J4C_IAS_GROUP });
            const groupMembers = rawMembers.map((m) => ({
                ...m,
                displayName: `${m.firstName || ''} ${m.lastName || ''}`.trim()
            }));

            const existingPersons = await SELECT.from(db.Person).where({ initiative_ID: initiative.ID });
            const { toCreate, toReactivate, toDeactivate } =
                diffPersonSync({ groupMembers, existingPersons, now: new Date() });

            if (toCreate.length) {
                await INSERT.into(db.Person).entries(
                    toCreate.map((p) => ({ ...p, initiative_ID: initiative.ID }))
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

            const result = {
                created: toCreate.length,
                reactivated: toReactivate.length,
                deactivated: toDeactivate.length
            };
            LOG.info(`${USAGE_SOURCE.key}: user sync done`, result);
            return result;
        });

        // ── Job 2: usage (audit log) ──────────────────────────────────────────────
        // No daysBack: the pipeline reads yesterday, the last complete day (daily schedule).
        // With daysBack (1 to MAX_DAYS_BACK): that many days up to and including today (backfill).
        this.on('syncJ4CUsage', async (req) => {
            const n = parseInt(req.data.daysBack, 10);
            const daysBack = Number.isNaN(n) ? undefined : Math.min(Math.max(n, 1), MAX_DAYS_BACK);
            return usage.runPipeline({ source: USAGE_SOURCE, daysBack });
        });

        return super.init();
    }
};