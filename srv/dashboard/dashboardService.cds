using {ai.enablement.dashboard as db} from '../../db/schema';

@path: '/dashboard'
service DashboardService {

  // @restrict: [ { grant: 'READ', to: 'DashboardViewer' } ]
  @readonly
  entity Initiatives as projection on db.Initiative;

  // @restrict: [ { grant: 'READ', to: 'DashboardViewer' } ]
  @readonly
  entity Persons     as
    projection on db.Person {
      *,
      initiative.name as initiativeName : String
    };

  // @restrict: [
  //   { grant: ['READ'], to: ['DashboardViewer', 'DashboardAdmin'] }
  // ]
  @readonly
  entity ActiveUsers as projection on db.ActiveUserList;

  // ── Trend chart aggregation action ────────────────────────────────────────
  // Returns COUNT DISTINCT per (periodLabel, grain) for the trend chart KPI.
  // Implemented in dashboard-service.js — never hits the DB with a raw query.
  // grain values: WEEKLY | MONTHLY | YEARLY
  // WEEKLY and YEARLY results carry isEstimated: true — labeled in UI.
  // ─────────────────────────────────────────────────────────────────────────
  // @restrict: [
  //   { grant: ['EXECUTE'], to: ['DashboardViewer', 'DashboardAdmin'] }
  // ]
  function getTrendCounts(grain: String(10), initiativeId: UUID) returns array of {
  periodLabel : String(10);
  grain       : String(10);
  activeCount : Integer;
};

  // ── Enabled user count action ─────────────────────────────────────────────
  // Returns COUNT of active Person records for a given Initiative.
  // Used to populate the enabledUsers KPI tile on Screen 2.
  // Reads from Person (PII table) server-side only — count only, no PII out.
  // ─────────────────────────────────────────────────────────────────────────
  // @restrict: [
  //   { grant: ['EXECUTE'], to: ['DashboardViewer', 'DashboardAdmin'] }
  // ]
  function getEnabledUserCount(initiativeId: UUID) returns {
    count : Integer;
  };

  // Reset data
  action resetData() returns { dailyAccess : Integer; activeUsers : Integer; persons : Integer; initiatives : Integer };


}
