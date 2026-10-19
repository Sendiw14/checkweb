/**
 * TypeScript mirrors of the CHECK-constrained text enums in the database.
 * tests/db/enums.test.ts asserts these cannot drift from the migrations.
 */
export const ROLES = ["owner", "admin", "production_operator", "warehouse_operator", "support_agent", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBERSHIP_STATUSES = ["active", "suspended"] as const;

export const BATCH_PROCESSING_STATUSES = ["planned", "in_production", "completed", "cancelled"] as const;
export type BatchProcessingStatus = (typeof BATCH_PROCESSING_STATUSES)[number];

export const BATCH_RELEASE_STATUSES = ["pending", "qc_hold", "released", "quarantined"] as const;
export type BatchReleaseStatus = (typeof BATCH_RELEASE_STATUSES)[number];

export const UNIT_LIFECYCLE_STATUSES = ["registered", "qc_passed", "released", "quarantined", "retired"] as const;
export type UnitLifecycleStatus = (typeof UNIT_LIFECYCLE_STATUSES)[number];

export const UNIT_LABEL_STATUSES = ["unlabelled", "issued", "printed", "applied"] as const;
export type UnitLabelStatus = (typeof UNIT_LABEL_STATUSES)[number];

export const TOKEN_STATUSES = ["active", "revoked", "replaced"] as const;
export type TokenStatus = (typeof TOKEN_STATUSES)[number];

export const LABEL_JOB_KINDS = ["issue", "reissue"] as const;
export const LABEL_JOB_STATES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type LabelJobState = (typeof LABEL_JOB_STATES)[number];

export const LABEL_EVENT_TYPES = ["issued", "printed", "applied", "damage_reported", "revoked", "reissued", "qc_scanned"] as const;

export const VERIFICATION_RESULTS = [
  "recognized_first",
  "recognized_repeat",
  "suspicious",
  "invalid",
  "revoked",
  "recalled",
  "quarantined",
  "not_released",
  "retired",
] as const;
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

export const VERIFICATION_CHANNELS = ["customer", "qc", "automated"] as const;
export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];

export const RECALL_STATUSES = ["draft", "active", "closed"] as const;
export type RecallStatus = (typeof RECALL_STATUSES)[number];

export const INVESTIGATION_ORIGINS = ["risk_rule", "manual", "support_case"] as const;
export const INVESTIGATION_SEVERITIES = ["low", "medium", "high"] as const;
export const INVESTIGATION_STATUSES = ["open", "in_review", "resolved_benign", "resolved_confirmed", "dismissed"] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const SUPPORT_KINDS = ["question", "concern", "suspected_counterfeit", "recall_enquiry"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];
export const SUPPORT_STATUSES = ["new", "open", "waiting_customer", "resolved", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const RISK_REASONS = ["rapid_repeat", "many_networks", "many_countries", "high_lifetime", "revoked_scans"] as const;
export type RiskReason = (typeof RISK_REASONS)[number];
