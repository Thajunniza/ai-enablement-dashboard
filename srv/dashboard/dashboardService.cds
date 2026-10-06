using {ai.enablement.dashboard as db} from '../../db/schema';

// Every request needs at least the DashboardViewer scope.
// The UserDetail and Admin role templates include it (see xs-security.json),
// so this one check covers all three roles.
@path    : '/dashboard'
@requires: 'DashboardViewer'
service DashboardService {

  @readonly
  entity Initiatives as projection on db.Initiative;

  // Names and emails are masked in dashboardService.js
  // unless the user also has the DashboardUserDetail scope.
  @readonly
  entity Persons     as
    projection on db.Person {
      *,
      initiative.name as initiativeName : String
    };

  // Rows carry the person association; the same masking applies there.
  @readonly
  entity ActiveUsers as projection on db.ActiveUserList;

  // Number of distinct active users per (periodLabel, grain) for the trend chart.
  // grain: WEEKLY | MONTHLY | YEARLY. initiativeId is optional (all initiatives when omitted).
  function getTrendCounts(grain: String(10), initiativeId: UUID) returns array of {
    periodLabel : String(10);
    grain       : String(10);
    activeCount : Integer;
  };

  // Number of active Person records of one initiative (KPI tile). Count only, no personal data.
  function getEnabledUserCount(initiativeId: UUID)               returns {
    count : Integer;
  };
}
