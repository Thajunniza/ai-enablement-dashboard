namespace ai.enablement.dashboard;

using { cuid, managed } from '@sap/cds/common';

// ─────────────────────────────────────────────────────────────
// Assigned Users
// Source: IAS SCIM API — JOULE_FOR_CONSULTANTS_END_USER group
// No PII stored.
// anonymizedId = SHA-256(userId + tenantSalt)
// ─────────────────────────────────────────────────────────────
entity AssignedUsers : managed {
  key anonymizedId  : String(64);
      orgRefId      : String(100);
      serviceType   : String(50)  default 'J4C';
      assignedAt    : Timestamp;

      @assert.range
      status        : String(20)  
                      enum { active; inactive; suspended; }
                      default 'active';

      lastSyncedAt  : Timestamp;
      usageEvents   : Association to many UsageEvents
                      on usageEvents.anonymizedId = anonymizedId;
}

// ─────────────────────────────────────────────────────────────
// Usage Events
// Source:
//  • SAP Audit Log Service  → grain = 'daily'   → isEstimated: true
//  • J4C Console Export     → grain = 'monthly' → isEstimated: false (authoritative)
// ─────────────────────────────────────────────────────────────
entity UsageEvents : managed {
  key anonymizedId  : String(64);
  key eventDate     : Date;

      @assert.range
  key grain         : String(10)
                      enum { daily; monthly; };

      serviceType   : String(50)  default 'J4C';
      sessionCount  : Integer     default 0;
      messageCount  : Integer     default 0;
      isEstimated   : Boolean     default false;
      @assert.range
      sourceSystem : String(30)
               enum {
                 AUDIT_LOG;
                 J4C_CONSOLE;
               } default 'J4C_CONSOLE'; 

      assignedUser  : Association to AssignedUsers
                      on assignedUser.anonymizedId = anonymizedId;
}

// ─────────────────────────────────────────────────────────────
// Authoritative Monthly Active Users
// Source: J4C Console Export (authoritative)
// • Dashboard KPI tiles must read from this entity
// • Yearly views aggregated from this entity are labeled
//   estimated in the UI layer — not in this schema
// • snapshotMonth must always be first day of month: YYYY-MM-01
// ─────────────────────────────────────────────────────────────
entity MonthlyActiveUsers : managed {
  key snapshotMonth : Date;
  key orgRefId      : String(100);
      serviceType   : String(50)  default 'J4C';
      activeCount   : Integer     default 0;
      assignedCount : Integer     default 0;
      utilizationPct: Decimal(5,2);
      isEstimated   : Boolean     default false;

      @assert.range
      dataSource    : String(20)  
                      enum { j4c_console; audit_log; }
                      default 'j4c_console';
}

// ─────────────────────────────────────────────────────────────
// Cost Tracking
// Source: J4C Console
// Supports:
//  • Cost KPI tile
//  • Capacity monitoring (licensedSeats vs activeSeats)
//  • AI Unit consumption trends
// • snapshotMonth must always be first day of month: YYYY-MM-01
// ─────────────────────────────────────────────────────────────
entity CostTracking : managed {
  key snapshotMonth  : Date;
  key orgRefId       : String(100);
      serviceType    : String(50)  default 'J4C';
      licensedSeats  : Integer     default 0;
      activeSeats    : Integer     default 0;
      costPerSeat    : Decimal(10,2);
      totalCost      : Decimal(15,2);
      aiUnitsConsumed: Decimal(15,2);
      currency       : String(3)   default 'USD';
}

// ─────────────────────────────────────────────────────────────
// Ingestion Checkpoints
// Enables incremental ingestion and restart recovery.
// Used by all three scheduler jobs:
//  • SCIM pull        → sourceSystem: 'IAS_SCIM'
//  • Audit Log pull   → sourceSystem: 'AUDIT_LOG'
//  • Console snapshot → sourceSystem: 'J4C_CONSOLE'
//
// Scheduler upsert pattern:
//  SELECT WHERE sourceSystem = ? AND checkpointType = ?
//  → UPDATE lastProcessedAt + lastToken on match
//  → INSERT new record on no match
// cuid adds auto-generated UUID key (ID) — never used for lookup
// ─────────────────────────────────────────────────────────────
entity IngestionCheckpoints : cuid, managed {
      sourceSystem    : String(50);
      checkpointType  : String(50);
      lastProcessedAt : Timestamp;
      lastToken       : LargeString;
}