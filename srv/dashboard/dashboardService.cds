using { ai.enablement.dashboard as db } from '../../db/schema';

@path: '/dashboard'
service DashboardService {

  // @restrict: [ { grant: 'READ', to: 'DashboardViewer' } ]
   @readonly
    entity Initiatives as projection on db.Initiative;

  // @restrict: [ { grant: 'READ', to: 'DashboardViewer' } ]
  @readonly
  entity Persons as projection on db.Person {
    *,
    initiative.name as initiativeName : String
  };
}