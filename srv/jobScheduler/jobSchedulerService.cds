using { ai.enablement.dashboard as db } from '../../db/schema';

@path: '/admin'
// @requires: 'DashboardAdmin'
service JobSchedulerService {

  entity Initiatives as projection on db.Initiative;
  entity Persons as projection on db.Person;
  action syncJ4CUsers() returns {
    created     : Integer;
    reactivated : Integer;
    deactivated : Integer;
  };

  // Next job, same initiative, own source (audit log instead of SCIM):
  // action syncJ4CUsage() returns { eventsIngested : Integer };
}