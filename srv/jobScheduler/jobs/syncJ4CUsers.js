'use strict';
const cds = require('@sap/cds');
const { getGroupMembers } = require('../lib/scimSource');
const { diffPersonSync } = require('../lib/diffPersonSync');

const J4C_IAS_GROUP = 'SAP_J4C_Enduser';

async function syncJ4CUsers() {
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
}

module.exports = { syncJ4CUsers };