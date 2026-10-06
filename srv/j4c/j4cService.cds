using {ai.enablement.dashboard as db} from '../../db/schema';

// Jobs of the J4C initiative.
// Called by the Job Scheduling Service (role JobScheduler), or by an admin who
// starts a run by hand (role DashboardAdmin).
// Keep these role names identical to ROLES in srv/shared/constants.js and to the
// scopes in xs-security.json.
@path    : '/J4C'
@requires: [
  'JobScheduler',
  'DashboardAdmin'
]
service J4CService {

  // Reads the members of the J4C IAS group (SCIM) and updates the Person table:
  // new members are created, returning members reactivated, removed members deactivated.
  action syncJ4CUsers()                  returns {
    created     : Integer;
    reactivated : Integer;
    deactivated : Integer;
  };

  // Reads J4C sign-ins from the audit log, updates the daily access buffer and the
  // weekly, monthly and yearly active-user lists, then removes old buffer rows.
  // daysBack is optional: without it the job reads yesterday only (the last complete day).
  // With it, the job reads that many days up to and including today (1 to 90), for a backfill.
  action syncJ4CUsage(daysBack: Integer) returns {
    scanned        : Integer;
    accessEvents   : Integer;
    matched        : Integer;
    unmatchedUsers : Integer;
    rosterRows     : Integer;
    cleaned        : Integer;
  };
}