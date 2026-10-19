import type { Role } from "@/server/domain/enums";

/**
 * Every sensitive operation names exactly one permission. Roles are mapped to
 * permissions here, in one reviewable table, and the guards in guards.ts enforce
 * them on the server for pages, server actions and route handlers.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "products.read", "products.write",
  "batches.read", "batches.write", "batches.qc", "batches.release", "batches.quarantine",
  "units.read", "units.retire",
  "labels.read", "labels.generate", "labels.download", "labels.confirm", "labels.reissue",
  "qc.verify",
  "scans.read", "security.signals",
  "investigations.read", "investigations.manage",
  "recalls.read", "recalls.write", "recalls.activate",
  "support.read", "support.manage",
  "reports.read", "reports.export",
  "team.read", "team.manage",
  "settings.read", "settings.write",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);
const without = (...p: Permission[]) => new Set<Permission>([...ALL].filter((x) => !p.includes(x)));
const only = (...p: Permission[]) => new Set<Permission>(p);

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: ALL,
  // Admins run the business day to day. They cannot touch owners (enforced in the team actions)
  // and cannot change company-wide settings.
  admin: without("settings.write"),
  production_operator: only(
    "dashboard.view", "products.read", "batches.read", "batches.write", "batches.qc", "units.read",
    "labels.read", "labels.generate", "labels.download", "labels.confirm", "labels.reissue", "qc.verify",
  ),
  warehouse_operator: only(
    "dashboard.view", "products.read", "batches.read", "batches.release", "batches.quarantine", "units.read",
    "labels.read", "labels.confirm", "qc.verify", "recalls.read",
  ),
  support_agent: only(
    "dashboard.view", "products.read", "batches.read", "units.read", "scans.read", "security.signals",
    "investigations.read", "investigations.manage", "support.read", "support.manage", "recalls.read",
  ),
  auditor: only(
    "dashboard.view", "products.read", "batches.read", "units.read", "labels.read", "scans.read", "security.signals",
    "investigations.read", "recalls.read", "support.read", "reports.read", "reports.export", "team.read",
    "settings.read", "audit.read",
  ),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Administrator",
  production_operator: "Production operator",
  warehouse_operator: "Warehouse operator",
  support_agent: "Support agent",
  auditor: "Auditor (read-only)",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including other owners and company settings.",
  admin: "Runs products, batches, labels, recalls, support and the team (except owners and company settings).",
  production_operator: "Registers batches, generates and confirms labels, passes QC.",
  warehouse_operator: "Releases or quarantines stock and confirms labels were applied.",
  support_agent: "Handles support cases and investigates suspicious scan activity.",
  auditor: "Read-only access to everything, including the audit log and reports.",
};

/** Roles whose accounts can do the most damage; MFA is required for them when enforced. */
export const PRIVILEGED_ROLES: readonly Role[] = ["owner", "admin"];

/** Who may assign or remove a given role. Owners are only ever managed by owners. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner" && target !== "admin";
  return false;
}
