import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can, canManageRole, type Permission } from "@/server/auth/permissions";
import { ROLES, type Role } from "@/server/domain/enums";

const allowed = (role: Role) => PERMISSIONS.filter((p) => can(role, p));

describe("role permission matrix", () => {
  it("every role is defined and only uses known permissions", () => {
    for (const r of ROLES) {
      expect(ROLE_PERMISSIONS[r], r).toBeDefined();
      for (const p of ROLE_PERMISSIONS[r]) expect(PERMISSIONS).toContain(p);
    }
  });

  it("owner can do everything", () => expect(allowed("owner")).toEqual([...PERMISSIONS]));

  it("admin can do everything except change company settings", () => {
    expect(PERMISSIONS.filter((p) => !can("admin", p))).toEqual(["settings.write"]);
  });

  it("auditor is strictly read-only", () => {
    for (const p of allowed("auditor")) expect(/\.(read|view|signals|export)$/.test(p), p).toBe(true);
    for (const p of ["products.write", "batches.write", "labels.generate", "labels.reissue", "recalls.activate", "team.manage", "settings.write", "support.manage", "qc.verify"] as Permission[]) {
      expect(can("auditor", p), p).toBe(false);
    }
  });

  it("production operators cannot release stock, run recalls, see scans or manage staff", () => {
    for (const p of ["batches.release", "batches.quarantine", "recalls.write", "recalls.activate", "scans.read", "security.signals", "team.manage", "audit.read", "support.read"] as Permission[]) {
      expect(can("production_operator", p), p).toBe(false);
    }
    expect(can("production_operator", "labels.generate")).toBe(true);
    expect(can("production_operator", "labels.download")).toBe(true);
  });

  it("warehouse operators release and quarantine but cannot generate or download label artifacts", () => {
    expect(can("warehouse_operator", "batches.release")).toBe(true);
    expect(can("warehouse_operator", "batches.quarantine")).toBe(true);
    expect(can("warehouse_operator", "labels.generate")).toBe(false);
    expect(can("warehouse_operator", "labels.download")).toBe(false);
  });

  it("support agents see scan signals and cases but cannot touch inventory or labels", () => {
    expect(can("support_agent", "support.manage")).toBe(true);
    expect(can("support_agent", "investigations.manage")).toBe(true);
    for (const p of ["products.write", "batches.write", "batches.release", "labels.generate", "labels.download", "recalls.write", "team.read", "audit.read"] as Permission[]) {
      expect(can("support_agent", p), p).toBe(false);
    }
  });

  it("label artifacts (which contain live credentials) are limited to production staff, admins and owners", () => {
    const withDownload = ROLES.filter((r) => can(r, "labels.download")).sort();
    expect(withDownload).toEqual(["admin", "owner", "production_operator"]);
  });

  it("nobody but owner/admin can manage the team", () => {
    expect(ROLES.filter((r) => can(r, "team.manage")).sort()).toEqual(["admin", "owner"]);
  });
});

describe("canManageRole (protection against privilege escalation)", () => {
  it("owners manage everyone; admins manage only non-privileged roles; everyone else no one", () => {
    for (const t of ROLES) expect(canManageRole("owner", t)).toBe(true);
    expect(canManageRole("admin", "owner")).toBe(false);
    expect(canManageRole("admin", "admin")).toBe(false);
    for (const t of ["production_operator", "warehouse_operator", "support_agent", "auditor"] as Role[]) expect(canManageRole("admin", t)).toBe(true);
    for (const a of ["production_operator", "warehouse_operator", "support_agent", "auditor"] as Role[]) {
      for (const t of ROLES) expect(canManageRole(a, t), `${a}->${t}`).toBe(false);
    }
  });
});
