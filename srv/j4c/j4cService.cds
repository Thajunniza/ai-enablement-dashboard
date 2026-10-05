using {ai.enablement.dashboard as db} from '../../db/schema';

@path: '/J4C'
service J4CService {

  entity Initiatives as projection on db.Initiative;
  entity Persons     as projection on db.Person;

  action syncJ4CUsers()                  returns {
    created     : Integer;
    reactivated : Integer;
    deactivated : Integer;
  };

  // Next job, same initiative, own source (audit log instead of SCIM):
  action syncJ4CUsage(daysBack: Integer) returns {
    scanned        : Integer;
    accessEvents   : Integer;
    matched        : Integer;
    unmatchedUsers : Integer;
    rosterRows     : Integer;
    cleaned        : Integer;
  };
}
