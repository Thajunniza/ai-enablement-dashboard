namespace ai.enablement.dashboard;
using { cuid } from '@sap/cds/common';

entity Initiative : cuid {
  name                : String(100) @mandatory;
  owner               : String(100);
  status              : String(20) default 'Live';
  launchDate          : Date;
  iasGroup            : String(100) @mandatory;
  persons             : Composition of many Person on persons.initiative = $self;
  virtual enabledUsers       : Integer;
  virtual statusCriticality  : Integer;
}

entity Person {
  key scimId     : String(60);
  key initiative : Association to Initiative;
  email          : String(200) @mandatory;
  firstName      : String(100);
  lastName       : String(100);
  displayName    : String(200);
  active         : Boolean;
  firstSeenAt    : Timestamp;
  lastSeenAt     : Timestamp;
}

// ── Table 1: 7-day rolling buffer ───────────────────────────────
// One row = this person (on this initiative) was seen in the audit
// log on this date. Keyed through Person, so it's automatically
// scoped to the right initiative — no separate initiative key needed.
entity DailyAccess {
  key person     : Association to Person;
  key accessDate : Date;
}

// ── Table 2: permanent per-period roster ────────────────────────
// One row = this person was active at least once in this period.
// Never summed, never double-counted — presence in this table IS
// the membership; COUNT(*) grouped by (periodLabel, grain) is the
// trend-chart number, no separate aggregation table needed.
entity ActiveUserList {
  key periodLabel : String(10);                       // '2026-W40' / '2026-09' / '2026'
  key grain       : String(10) enum { WEEKLY; MONTHLY; YEARLY; };
  key person      : Association to Person;
      firstSeen   : Date;
      lastSeen    : Date;
}