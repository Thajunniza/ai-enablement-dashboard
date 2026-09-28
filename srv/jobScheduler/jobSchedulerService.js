'use strict';
const cds = require('@sap/cds');
const { syncJ4CUsers } = require('./jobs/syncJ4CUsers');

module.exports = class JobSchedulerService extends cds.ApplicationService {
  async init() {
    this.on('syncJ4CUsers', async () => syncJ4CUsers());

    // Same pattern for every future job:
    // this.on('syncJ4CUsage', async () => syncJ4CUsage());

    return super.init();
  }
};