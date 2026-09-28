'use strict';

// Mock stand-in for the real SCIM group-members call. The real source
// (built later, same file location, calling IAS's /scim/Users) must return
// this exact shape: an array of { scimId, email, firstName, lastName, active }.
async function getGroupMembers({ iasGroup } = {}) {
  // Deliberately different from the seeded Person.csv, so a sync against
  // this mock exercises all three live branches of diffPersonSync:
  //   - bin.jiang       : already in Person, still in this group -> refresh
  //   - robert.maloney  : in Person, missing from this group     -> deactivate
  //   - alice.chen      : not in Person yet, new in this group   -> create
  return [
    { scimId: '222d6e67-4101-4fdb-bedc-d13ad1f61ee2', email: 'bin.jiang@aptiv.com',   firstName: 'Bin',   lastName: 'Jiang', active: true },
    { scimId: 'f0a1b2c3-0000-4000-8000-000000000099', email: 'alice.chen@aptiv.com',  firstName: 'Alice', lastName: 'Chen',  active: true }
  ];
}

module.exports = { getGroupMembers };