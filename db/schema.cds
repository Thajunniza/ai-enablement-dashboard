namespace ai.enablement.dashboard;
using { cuid } from '@sap/cds/common';

entity Initiative : cuid {
  name       : String(100) @mandatory;
  owner      : String(100);
  status     : String(20) default 'Live';
  launchDate : Date;
  iasGroup   : String(100) @mandatory;
  persons    : Composition of many Person on persons.initiative = $self;   // was: Association to many
}

entity Person {
  key scimId     : String(60);
  key initiative : Association to Initiative;   // child side stays a plain Association — this is the standard CAP composition pattern
  email       : String(200) @mandatory;
  firstName   : String(100);
  lastName    : String(100);
  displayName : String(200);
  active      : Boolean;
  firstSeenAt : Timestamp;
  lastSeenAt  : Timestamp;
}