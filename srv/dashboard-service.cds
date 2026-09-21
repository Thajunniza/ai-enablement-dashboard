namespace ai.enablement.dashboard;

using { ai.enablement.dashboard as db } from '../db/schema';

// ─────────────────────────────────────────────────────────────
// Dashboard Service
// Exposes read-only OData V4 projections for all four
// dashboard entities. XSUAA authentication is mandatory
// in production — auth kind is configured in .cdsrc.json.
//
// Roles:
//  DashboardViewer — read-only access to all entities
//  DashboardAdmin  — read-only access + IngestionCheckpoints
//
// All projections are @readonly — no write operations
// are exposed through this service.
// No PII is exposed — anonymizedId is SHA-256 hash only.
// ─────────────────────────────────────────────────────────────

@path: '/api/dashboard'
@odata service DashboardService {

  // ── Assigned Users ──────────────────────────────────────────
  // Source: IAS SCIM API
  // anonymizedId = SHA-256(userId + tenantSalt) — no PII
  // UI: Anonymized user table + assigned count KPI tile
  // ────────────────────────────────────────────────────────────
  @readonly
  @Capabilities.FilterRestrictions.FilterExpressionRestrictions: [
    { Property: 'status',      AllowedExpressions: #SingleValue },
    { Property: 'orgRefId',    AllowedExpressions: #SingleValue },
    { Property: 'serviceType', AllowedExpressions: #SingleValue }
  ]
  entity AssignedUsers      as projection on db.AssignedUsers
    excluding { usageEvents };

  // ── Usage Events ────────────────────────────────────────────
  // Source:
  //  grain = 'daily'   → SAP Audit Log Service → isEstimated: true
  //  grain = 'monthly' → J4C Console Export    → isEstimated: false
  // UI: Time grain toggle — daily view labeled as estimated
  // ────────────────────────────────────────────────────────────
  @readonly
  @Capabilities.FilterRestrictions.FilterExpressionRestrictions: [
    { Property: 'grain',        AllowedExpressions: #SingleValue },
    { Property: 'sourceSystem', AllowedExpressions: #SingleValue },
    { Property: 'isEstimated',  AllowedExpressions: #SingleValue },
    { Property: 'orgRefId',     AllowedExpressions: #SingleValue }
  ]
  entity UsageEvents        as projection on db.UsageEvents
    excluding { assignedUser };

  // ── Monthly Active Users (authoritative KPI source) ─────────
  // Source: J4C Console Export — authoritative
  // Dashboard KPI tiles MUST read from this entity.
  // Yearly aggregations derived from this entity are labeled
  // estimated in the UI layer.
  // ────────────────────────────────────────────────────────────
  @readonly
  @Capabilities.FilterRestrictions.FilterExpressionRestrictions: [
    { Property: 'orgRefId',     AllowedExpressions: #SingleValue },
    { Property: 'dataSource',   AllowedExpressions: #SingleValue },
    { Property: 'serviceType',  AllowedExpressions: #SingleValue }
  ]
  entity MonthlyActiveUsers as projection on db.MonthlyActiveUsers;

  // ── Cost Tracking ───────────────────────────────────────────
  // Source: J4C Console
  // Supports: Cost KPI tile, capacity monitoring,
  //           AI Unit consumption trends
  // ────────────────────────────────────────────────────────────
  @readonly
  @Capabilities.FilterRestrictions.FilterExpressionRestrictions: [
    { Property: 'orgRefId',    AllowedExpressions: #SingleValue },
    { Property: 'serviceType', AllowedExpressions: #SingleValue },
    { Property: 'currency',    AllowedExpressions: #SingleValue }
  ]
  entity CostTracking       as projection on db.CostTracking;

  // ── Ingestion Checkpoints (admin visibility only) ───────────
  // Restricted to DashboardAdmin role.
  // Exposes scheduler job health — last sync timestamps
  // per sourceSystem + checkpointType.
  // lastToken excluded — internal cursor, not for UI display.
  // ────────────────────────────────────────────────────────────
  @readonly
  @(requires: 'DashboardAdmin')
  entity IngestionCheckpoints as projection on db.IngestionCheckpoints
    { ID, sourceSystem, checkpointType, lastProcessedAt,
      createdAt, modifiedAt };
}