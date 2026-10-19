import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can, type Permission } from "@/server/auth/permissions";
import type { Role } from "@/server/domain/enums";
import { ROLES } from "@/server/domain/enums";
import { admin, clearMemberships, closePools } from "./support/fixtures";
import { TEST_DB } from "./support/urls";

const base = `127.0.0.1:${process.env.TEST_PG_PORT ?? "5432"}/${TEST_DB}`;
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: `postgres://app_server:app_server_dev_pw@${base}`, VERIFIER_DATABASE_URL: `postgres://app_verifier:app_verifier_dev_pw@${base}`,
  SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40),
  PUBLIC_SITE_URL: "https://verify.example.com", NETWORK_HASH_PEPPER: "test-pepper-".padEnd(40, "x"), ARTIFACT_STORAGE: "local",
});

// --- the session is the only thing we fake: everything else is the real action code against the real database ---
type FakeState =
  | { status: "anonymous" }
  | { status: "no_membership" | "suspended"; userId: string }
  | { status: "ok"; staff: { userId: string; email: string; displayName: string; role: Role; aal: "aal1" | "aal2"; mfaEnrolled: boolean; mfaRequired: boolean } };
const session = vi.hoisted(() => ({ state: { status: "anonymous" } as unknown }));
vi.mock("@/server/auth/session", () => ({
  getSessionState: async () => session.state,
  getStaff: async () => ((session.state as FakeState).status === "ok" ? (session.state as { staff: unknown }).staff : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ getAll: () => [], set: () => {}, get: () => undefined }) }));

const staffAs = (role: Role, over: Partial<{ aal: "aal1" | "aal2"; mfaEnrolled: boolean; mfaRequired: boolean }> = {}): FakeState => ({
  status: "ok",
  staff: { userId: randomUUID(), email: `${role}@example.test`, displayName: role, role, aal: "aal2", mfaEnrolled: false, mfaRequired: false, ...over },
});

const GUARD_MESSAGE = "You don't have permission to do that.";
const SESSION_MESSAGE = "Your session has ended. Sign in again to continue.";
const id = () => randomUUID();
const form = () => new FormData();

type Entry = { file: string; fn: string; perm: Permission | "signedIn"; args: () => unknown[] };

/**
 * The reviewable registry. If someone adds an exported server action and forgets to register it
 * (and therefore to decide who may call it) the completeness test below fails.
 * Arguments are deliberately junk: they must never reach a successful write, only prove the guard ran.
 */
const REGISTRY: Entry[] = [
  { file: "team", fn: "inviteStaff", perm: "team.manage", args: () => [{}] },
  { file: "team", fn: "createAccessLink", perm: "team.manage", args: () => [id()] },
  { file: "team", fn: "changeRole", perm: "team.manage", args: () => [id(), "auditor"] },
  { file: "team", fn: "setMemberStatus", perm: "team.manage", args: () => [id(), "suspended"] },
  { file: "labels", fn: "createLabelJob", perm: "labels.generate", args: () => [{}] },
  { file: "labels", fn: "advanceLabelJob", perm: "labels.generate", args: () => [id()] },
  { file: "labels", fn: "cancelLabelJob", perm: "labels.generate", args: () => [id()] },
  { file: "labels", fn: "retryLabelJob", perm: "labels.generate", args: () => [id()] },
  { file: "labels", fn: "confirmLabels", perm: "labels.confirm", args: () => [id(), null, "printed"] },
  { file: "labels", fn: "qcCheck", perm: "qc.verify", args: () => [{}] },
  { file: "settings", fn: "saveCompany", perm: "settings.write", args: () => [{}] },
  { file: "settings", fn: "saveLabelDefaults", perm: "settings.write", args: () => [{}] },
  { file: "settings", fn: "saveRiskRules", perm: "settings.write", args: () => [{}] },
  { file: "settings", fn: "saveRetention", perm: "settings.write", args: () => [{}] },
  { file: "settings", fn: "uploadLogo", perm: "settings.write", args: () => [form()] },
  { file: "settings", fn: "removeLogo", perm: "settings.write", args: () => [] },
  { file: "support", fn: "assignCase", perm: "support.manage", args: () => [id(), null] },
  { file: "support", fn: "setCaseStatus", perm: "support.manage", args: () => [id(), {}] },
  { file: "support", fn: "linkCaseUnit", perm: "support.manage", args: () => [id(), "x"] },
  { file: "support", fn: "escalateCase", perm: "investigations.manage", args: () => [id()] },
  { file: "products", fn: "createProduct", perm: "products.write", args: () => [{}] },
  { file: "products", fn: "updateProduct", perm: "products.write", args: () => [id(), {}] },
  { file: "products", fn: "setProductActive", perm: "products.write", args: () => [id(), true] },
  { file: "products", fn: "uploadProductImage", perm: "products.write", args: () => [id(), form()] },
  { file: "products", fn: "removeProductImage", perm: "products.write", args: () => [id()] },
  { file: "recalls", fn: "createRecall", perm: "recalls.write", args: () => [{}] },
  { file: "recalls", fn: "updateRecall", perm: "recalls.write", args: () => [id(), {}] },
  { file: "recalls", fn: "addRecallScope", perm: "recalls.write", args: () => [id(), {}] },
  { file: "recalls", fn: "removeRecallScope", perm: "recalls.write", args: () => [id(), "unit", id()] },
  { file: "recalls", fn: "activateRecall", perm: "recalls.activate", args: () => [id()] },
  { file: "recalls", fn: "closeRecall", perm: "recalls.activate", args: () => [id(), {}] },
  { file: "investigations", fn: "addNote", perm: "investigations.manage", args: () => [id(), {}] },
  { file: "investigations", fn: "assignInvestigation", perm: "investigations.manage", args: () => [id(), null] },
  { file: "investigations", fn: "setInvestigationStatus", perm: "investigations.manage", args: () => [id(), {}] },
  { file: "investigations", fn: "openInvestigation", perm: "investigations.manage", args: () => [{}] },
  { file: "batches", fn: "createBatch", perm: "batches.write", args: () => [{}] },
  { file: "batches", fn: "registerUnits", perm: "batches.write", args: () => [id(), {}] },
  { file: "batches", fn: "setQcHold", perm: "batches.qc", args: () => [id(), true] },
  { file: "batches", fn: "updateBatchNotes", perm: "batches.write", args: () => [id(), {}] },
  { file: "batches", fn: "setBatchProcessing", perm: "batches.write", args: () => [id(), "cancelled"] },
  { file: "part-units", fn: "revokeToken", perm: "labels.reissue", args: () => [id(), {}] },
  { file: "part-units", fn: "requestLabelReplacement", perm: "labels.reissue", args: () => [id(), {}] },
  { file: "part-units", fn: "reportLabelDamage", perm: "labels.confirm", args: () => [id(), {}] },
  { file: "security", fn: "enrollTotp", perm: "signedIn", args: () => [] },
  { file: "security", fn: "verifyEnrollment", perm: "signedIn", args: () => [id(), { code: "000000" }] },
  { file: "security", fn: "removeTotp", perm: "signedIn", args: () => [] },
  { file: "security", fn: "changePassword", perm: "signedIn", args: () => [{}] },
  { file: "security", fn: "signOutOtherDevices", perm: "signedIn", args: () => [] },
];

/** Actions whose permission depends on an argument: one entry per branch. */
const DYNAMIC: { file: string; fn: string; label: string; perm: Permission; args: () => unknown[] }[] = [
  { file: "batches", fn: "transitionBatch", label: "qc", perm: "batches.qc", args: () => [id(), "qc"] },
  { file: "batches", fn: "transitionBatch", label: "release", perm: "batches.release", args: () => [id(), "release"] },
  { file: "batches", fn: "transitionBatch", label: "quarantine", perm: "batches.quarantine", args: () => [id(), "quarantine", {}] },
  { file: "batches", fn: "transitionBatch", label: "restore", perm: "batches.quarantine", args: () => [id(), "restore"] },
  { file: "part-units", fn: "transitionUnit", label: "quarantined", perm: "batches.quarantine", args: () => [id(), "quarantined", {}] },
  { file: "part-units", fn: "transitionUnit", label: "restored", perm: "batches.quarantine", args: () => [id(), "restored"] },
  { file: "part-units", fn: "transitionUnit", label: "retired", perm: "units.retire", args: () => [id(), "retired", {}] },
];

/** Public by design: anyone may call these, so the list is closed and reviewed. */
const PUBLIC_EXPORTS: Record<string, string[]> = {
  "src/app/(auth)/actions.ts": ["signIn", "verifyMfa", "requestPasswordReset", "confirmEmailToken", "setNewPassword", "signOutAction"],
  "src/app/(public)/support/actions.ts": ["submitSupportCase"],
};

const root = process.cwd();
const ADMIN_FILES = [...new Set([...REGISTRY, ...DYNAMIC].map((e) => e.file))];
const sourceOf = (path: string) => readFileSync(join(root, path), "utf8");
const exportsOf = (src: string) => [...src.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]!);

type Result = { ok: boolean; code?: string; error?: string };
type Mod = Record<string, (...a: unknown[]) => Promise<Result>>;
const LOADERS: Record<string, () => Promise<unknown>> = {
  team: () => import("@/app/admin/team/actions"),
  labels: () => import("@/app/admin/labels/actions"),
  settings: () => import("@/app/admin/settings/actions"),
  support: () => import("@/app/admin/support/actions"),
  products: () => import("@/app/admin/products/actions"),
  recalls: () => import("@/app/admin/recalls/actions"),
  investigations: () => import("@/app/admin/investigations/actions"),
  batches: () => import("@/app/admin/batches/actions"),
  "part-units": () => import("@/app/admin/part-units/actions"),
  security: () => import("@/app/admin/security/actions"),
};
async function action(file: string, fn: string) {
  return ((await LOADERS[file]!()) as Mod)[fn]!;
}

afterAll(async () => {
  await clearMemberships(); // leave no owner rows behind for other test files
  const { closePools: closeApp } = await import("@/server/db/pool");
  await closeApp();
  await closePools();
});
beforeEach(() => { session.state = { status: "anonymous" }; });

describe("server action inventory (static)", () => {
  it("lists every admin action file that exists", () => {
    const dirs = readdirSync(join(root, "src/app/admin"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && readdirSync(join(root, "src/app/admin", d.name)).includes("actions.ts"))
      .map((d) => d.name).sort();
    expect(dirs).toEqual([...ADMIN_FILES].sort());
  });

  for (const file of ADMIN_FILES) {
    describe(`admin/${file}/actions.ts`, () => {
      const path = `src/app/admin/${file}/actions.ts`;
      const src = sourceOf(path);
      const exported = exportsOf(src);
      const registered = [...new Set([...REGISTRY, ...DYNAMIC].filter((e) => e.file === file).map((e) => e.fn))];

      it("is a server-action module", () => expect(src.trimStart().startsWith('"use server"')).toBe(true));

      it("registers exactly the functions it exports (no unreviewed public endpoint)", () => {
        expect([...exported].sort()).toEqual([...registered].sort());
      });

      it.each(exported)("%s runs its body inside authorized()/signedIn()", (fn) => {
        const start = src.indexOf(`export async function ${fn}(`);
        const next = src.indexOf("\nexport ", start + 1);
        const body = src.slice(start, next === -1 ? undefined : next);
        expect(body).toMatch(/return (authorized|signedIn)\b/);
        // Nothing that touches data or secrets may run before the guard.
        const guardAt = body.search(/return (authorized|signedIn)\b/);
        const before = body.slice(0, guardAt);
        expect(before).not.toMatch(/appPool\(|withTransaction\(|createSupabase|getSiteSettings\(|writeAudit\(|\.query\(/);
      });

      it.each(exported)("%s declares the permission the registry expects", (fn) => {
        const start = src.indexOf(`export async function ${fn}(`);
        const next = src.indexOf("\nexport ", start + 1);
        const body = src.slice(start, next === -1 ? undefined : next);
        const entries = [...REGISTRY, ...DYNAMIC].filter((e) => e.file === file && e.fn === fn);
        const literal = body.match(/return authorized(?:<[^(]*>)?\(\s*"([a-z.]+)"/)?.[1];
        if (entries.some((e) => "label" in e)) {
          expect(literal, "dynamic actions must not hard-code a permission").toBeUndefined();
        } else if (entries[0]!.perm === "signedIn") {
          expect(body).toMatch(/return signedIn\b/);
        } else {
          expect(literal).toBe(entries[0]!.perm);
        }
      });
    });
  }

  it("keeps the public action surface closed and reviewed", () => {
    for (const [path, names] of Object.entries(PUBLIC_EXPORTS)) {
      expect(exportsOf(sourceOf(path)).sort(), path).toEqual([...names].sort());
    }
  });

  it("every permission in the registry exists in the permission table", () => {
    for (const e of [...REGISTRY, ...DYNAMIC]) if (e.perm !== "signedIn") expect(PERMISSIONS).toContain(e.perm);
  });
});

describe("role × action matrix (real action code, real database)", () => {
  const rows = [...REGISTRY.filter((e) => e.perm !== "signedIn").map((e) => ({ ...e, label: "" })), ...DYNAMIC] as (Entry & { label: string })[];
  const auditCount = async () => Number((await admin.query("select count(*)::int as n from public.audit_logs")).rows[0].n);

  describe.each(ROLES as readonly Role[])("as %s", (role) => {
    it.each(rows.map((r) => [`${r.fn}${r.label ? `(${r.label})` : ""}`, r] as const))("%s", async (_name, r) => {
      session.state = staffAs(role);
      const fn = await action(r.file, r.fn);
      const allowed = can(role, r.perm as Permission);
      const before = await auditCount();
      let res: Result | undefined;
      let threw: unknown;
      try { res = await fn(...r.args()); } catch (e) { threw = e; }

      if (!allowed) {
        expect(threw, "a denied call must return a typed result, not throw").toBeUndefined();
        expect(res).toMatchObject({ ok: false, code: "forbidden", error: GUARD_MESSAGE });
        expect(await auditCount(), "a denied call must leave no trace").toBe(before);
      } else {
        // The guard let the call through. Junk input then fails later (validation / not found), never as a guard denial.
        if (threw === undefined) expect(res?.error).not.toBe(GUARD_MESSAGE);
      }
    });
  });

  it("the matrix agrees with ROLE_PERMISSIONS for every role", () => {
    // Sanity: at least one role may do each registered thing, and no role has a permission outside the table.
    for (const r of rows) expect(ROLES.some((role) => can(role as Role, r.perm as Permission)), `${r.fn} is unreachable`).toBe(true);
    for (const role of ROLES) for (const p of ROLE_PERMISSIONS[role as Role]) expect(PERMISSIONS).toContain(p);
  });

  describe.each([
    ["anonymous", (): FakeState => ({ status: "anonymous" })],
    ["authenticated but no membership", (): FakeState => ({ status: "no_membership", userId: id() })],
    ["suspended member", (): FakeState => ({ status: "suspended", userId: id() })],
    ["owner whose second factor is still owed", (): FakeState => staffAs("owner", { aal: "aal1", mfaEnrolled: true, mfaRequired: true })],
    ["owner who must enrol (policy) but has not", (): FakeState => staffAs("owner", { aal: "aal1", mfaEnrolled: false, mfaRequired: true })],
  ])("%s", (_label, make) => {
    it.each(rows.map((r) => [`${r.fn}${r.label ? `(${r.label})` : ""}`, r] as const))("%s is refused", async (_name, r) => {
      session.state = make();
      const before = await auditCount();
      const res = await (await action(r.file, r.fn))(...r.args());
      expect(res).toMatchObject({ ok: false, code: "forbidden" });
      expect(await auditCount()).toBe(before);
    });
  });

  describe("self-service security actions", () => {
    const sec = REGISTRY.filter((e) => e.file === "security");
    it.each(sec.map((e) => [e.fn, e] as const))("%s refuses anonymous, suspended and no-membership callers", async (_n, e) => {
      for (const s of [{ status: "anonymous" }, { status: "suspended", userId: id() }, { status: "no_membership", userId: id() }] as FakeState[]) {
        session.state = s;
        expect(await (await action("security", e.fn))(...e.args())).toMatchObject({ ok: false, code: "forbidden", error: SESSION_MESSAGE });
      }
    });
    it.each(sec.map((e) => [e.fn, e] as const))("%s refuses a session that still owes a code for an enrolled authenticator", async (_n, e) => {
      session.state = staffAs("owner", { aal: "aal1", mfaEnrolled: true, mfaRequired: true });
      expect(await (await action("security", e.fn))(...e.args())).toMatchObject({ ok: false, code: "forbidden" });
    });
    it("lets someone who has not enrolled yet reach enrolment-time actions (guard passes, input is then validated)", async () => {
      session.state = staffAs("owner", { aal: "aal1", mfaEnrolled: false, mfaRequired: true });
      const res = await (await action("security", "changePassword"))({});
      expect(res).toMatchObject({ ok: false, code: "validation" });
    });
    it("refuses to remove the authenticator where policy requires one, even for an aal2 owner", async () => {
      const { getEnv } = await import("@/server/env");
      session.state = staffAs("owner", { aal: "aal2", mfaEnrolled: true });
      const res = await (await action("security", "removeTotp"))();
      if (getEnv().REQUIRE_MFA_FOR_PRIVILEGED) expect(res).toMatchObject({ ok: false, code: "forbidden" });
      else expect(res.code).not.toBe("forbidden-by-policy"); // policy off in this environment; covered by the e2e suite
    });
  });
});

describe("team-management anti-escalation (real database)", () => {
  it("an admin cannot grant or touch owner or admin roles; only an owner can", async () => {
    const inviteStaff = await action("team", "inviteStaff");
    session.state = staffAs("admin");
    for (const role of ["owner", "admin"]) {
      const r = await inviteStaff({ email: `${randomUUID()}@example.test`, displayName: "X Y", role });
      expect(r, `admin inviting ${role}`).toMatchObject({ ok: false, code: "forbidden" });
    }
  });

  it("nobody can change their own role or suspend themselves", async () => {
    const s = staffAs("owner") as Extract<FakeState, { status: "ok" }>;
    await admin.query("insert into auth.users (id, email) values ($1, $2) on conflict do nothing", [s.staff.userId, s.staff.email]);
    await admin.query("insert into public.admin_memberships (user_id, email, role, status) values ($1, $2, 'owner', 'active')", [s.staff.userId, s.staff.email]);
    session.state = s;
    expect(await (await action("team", "changeRole"))(s.staff.userId, "auditor")).toMatchObject({ ok: false });
    expect(await (await action("team", "setMemberStatus"))(s.staff.userId, "suspended")).toMatchObject({ ok: false });
    const { rows } = await admin.query("select role, status from public.admin_memberships where user_id = $1", [s.staff.userId]);
    expect(rows[0]).toMatchObject({ role: "owner", status: "active" });
  });
});
