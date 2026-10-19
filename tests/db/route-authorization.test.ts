import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { can } from "@/server/auth/permissions";
import { ROLES, type Role } from "@/server/domain/enums";
import { labelSpecSchema } from "@/server/labels/spec";
import { createLocalStore } from "@/server/storage";
import { processNextChunk, type WorkerContext } from "@/server/labels/worker";
import { admin, closePools, createBatch, createProduct } from "./support/fixtures";
import { TEST_DB } from "./support/urls";

const storageRoot = mkdtempSync(join(tmpdir(), "route-auth-"));
const CRON_SECRET = "cron-secret-".padEnd(40, "s");
const base = `127.0.0.1:${process.env.TEST_PG_PORT ?? "5432"}/${TEST_DB}`;
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: `postgres://app_server:app_server_dev_pw@${base}`, VERIFIER_DATABASE_URL: `postgres://app_verifier:app_verifier_dev_pw@${base}`,
  SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40),
  PUBLIC_SITE_URL: "https://verify.example.com", NETWORK_HASH_PEPPER: "test-pepper-".padEnd(40, "x"),
  ARTIFACT_STORAGE: "local", LOCAL_STORAGE_DIR: storageRoot, CRON_SECRET,
});

type Fake =
  | { status: "anonymous" }
  | { status: "ok"; staff: { userId: string; email: string; displayName: string; role: Role; aal: "aal1" | "aal2"; mfaEnrolled: boolean; mfaRequired: boolean } };
const session = vi.hoisted(() => ({ state: { status: "anonymous" } as unknown }));
vi.mock("@/server/auth/session", () => ({ getSessionState: async () => session.state, getStaff: async () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ getAll: () => [], set: () => {}, get: () => undefined }) }));

const as = (role: Role, over: Partial<{ mfaRequired: boolean; mfaEnrolled: boolean }> = {}): Fake => ({
  status: "ok", staff: { userId: randomUUID(), email: `${role}@example.test`, displayName: role, role, aal: "aal2", mfaEnrolled: false, mfaRequired: false, ...over },
});
const get = (url: string, headers: Record<string, string> = {}) => new Request(`http://localhost${url}`, { headers });

let jobId: string;
let store: ReturnType<typeof createLocalStore>;
const spec = labelSpecSchema.parse({});

beforeAll(async () => {
  store = createLocalStore(join(storageRoot, "label-artifacts"));
  const ctx: WorkerContext = { company: "Axiom Motive", siteUrl: "https://verify.example.com", artifactDays: 14, store };
  const batch = await createBatch((await createProduct()).id, 3);
  await admin.query("select public.register_batch_units($1, 3)", [batch.id]);
  const r = (await admin.query("select public.create_label_job($1, 'issue', 3, $2, $3, null, null, 500, null) as r", [batch.id, randomUUID(), JSON.stringify(spec)])).rows[0].r as { jobId: string };
  jobId = r.jobId;
  for (let i = 0; i < 10; i++) if ((await processNextChunk(jobId, ctx)).status !== "progress") break;
});
afterAll(async () => {
  rmSync(storageRoot, { recursive: true, force: true });
  await (await import("@/server/db/pool")).closePools();
  await closePools();
});
beforeEach(() => { session.state = { status: "anonymous" }; });

describe("GET /api/admin/reports/export", () => {
  const route = () => import("@/app/api/admin/reports/export/route");
  const KINDS = [["events", "scans.read"], ["units", "units.read"], ["audit", "audit.read"]] as const;

  it("answers anonymous callers with 401 and never touches data", async () => {
    const { GET } = await route();
    for (const [kind] of KINDS) expect((await GET(get(`/api/admin/reports/export?kind=${kind}`))).status).toBe(401);
  });

  it("answers a session that still owes its second factor with 401", async () => {
    const { GET } = await route();
    session.state = as("owner", { mfaRequired: true, mfaEnrolled: true });
    expect((await GET(get("/api/admin/reports/export?kind=audit"))).status).toBe(401);
  });

  describe.each(ROLES as readonly Role[])("as %s", (role) => {
    it.each(KINDS)("kind=%s needs reports.export + %s", async (kind, perm) => {
      const { GET } = await route();
      session.state = as(role);
      const before = Number((await admin.query("select count(*)::int n from public.audit_logs where action = 'report.export'")).rows[0].n);
      const res = await GET(get(`/api/admin/reports/export?kind=${kind}`));
      const allowed = can(role, "reports.export") && can(role, perm);
      if (!allowed) {
        expect(res.status).toBe(403);
        expect(Number((await admin.query("select count(*)::int n from public.audit_logs where action = 'report.export'")).rows[0].n)).toBe(before);
      } else {
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/csv");
        expect(res.headers.get("cache-control")).toContain("no-store");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(Number((await admin.query("select count(*)::int n from public.audit_logs where action = 'report.export'")).rows[0].n)).toBe(before + 1);
      }
    });
  });

  it("rejects an unknown kind for an allowed role and exports no network identifiers or token material", async () => {
    const { GET } = await route();
    session.state = as("owner");
    expect((await GET(get("/api/admin/reports/export?kind=nonsense"))).status).toBe(400);
    for (const kind of ["events", "units", "audit"]) {
      const text = await (await GET(get(`/api/admin/reports/export?kind=${kind}`))).text();
      const header = text.split("\n")[0]!;
      expect(header).not.toMatch(/token|hash|network|ip|secret|email_hash/i);
    }
  });
});

describe("GET /api/admin/label-jobs/[id]/download/[part]", () => {
  const route = () => import("@/app/api/admin/label-jobs/[id]/download/[part]/route");
  const ctx = (id: string, part: string) => ({ params: Promise.resolve({ id, part }) }) as never;

  it("fixture produced a real downloadable artifact", async () => {
    const { rows } = await admin.query("select part_no from public.label_job_artifacts where job_id = $1", [jobId]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("anonymous → 401 and the live-credential PDF is not served", async () => {
    const { GET } = await route();
    const res = await GET(get("/x"), ctx(jobId, "1"));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type") ?? "").not.toContain("pdf");
  });

  describe.each(ROLES as readonly Role[])("as %s", (role) => {
    it("is allowed only with labels.download, and audited when it succeeds", async () => {
      const { GET } = await route();
      session.state = as(role);
      const before = Number((await admin.query("select count(*)::int n from public.audit_logs where action = 'label.download'")).rows[0].n);
      const res = await GET(get("/x"), ctx(jobId, "1"));
      if (!can(role, "labels.download")) {
        expect(res.status).toBe(403);
        expect(res.headers.get("content-type") ?? "").not.toContain("pdf");
      } else {
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("application/pdf");
        expect(res.headers.get("cache-control")).toContain("no-store");
        expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
        expect(Number((await admin.query("select count(*)::int n from public.audit_logs where action = 'label.download'")).rows[0].n)).toBe(before + 1);
      }
    });
  });

  it("returns 404 (not 500, not another job's file) for malformed ids, bad parts and unknown jobs", async () => {
    const { GET } = await route();
    session.state = as("owner");
    for (const [id, part] of [["not-a-uuid", "1"], [jobId, "0"], [jobId, "-1"], [jobId, "1.5"], [jobId, "abc"], [randomUUID(), "1"], [jobId, "9999"], ["../../etc/passwd", "1"]]) {
      expect((await GET(get("/x"), ctx(id!, part!))).status, `${id}/${part}`).toBe(404);
    }
  });

  it("an expired artifact is refused with 410-style JSON and its bytes are not served", async () => {
    const { GET } = await route();
    session.state = as("owner");
    await admin.query("update public.label_job_artifacts set expires_at = now() - interval '1 minute' where job_id = $1 and part_no = 1", [jobId]);
    try {
      const res = await GET(get("/x"), ctx(jobId, "1"));
      expect(res.headers.get("content-type") ?? "").not.toContain("pdf");
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect((await res.json()).error).toBe("expired");
    } finally {
      await admin.query("update public.label_job_artifacts set expires_at = now() + interval '14 days' where job_id = $1 and part_no = 1", [jobId]);
    }
  });
});

describe("GET /api/admin/search", () => {
  const route = () => import("@/app/api/admin/search/route");
  const needle = `ZQ${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  beforeAll(async () => {
    await admin.query("insert into public.products (sku, part_number, name, brand, category) values ($1, $2, $3, 'Axiom', 'Brakes')", [`${needle}-SKU`, `${needle}-PN`, `${needle} product`]);
    await admin.query("insert into public.support_cases (kind, subject, message, contact_email) values ('question', $1, 'a long enough message body', 'c@example.test')", [`${needle} support subject`]);
  });

  it("anonymous → 401", async () => {
    const { GET } = await route();
    expect((await GET(get(`/api/admin/search?q=${needle}`))).status).toBe(401);
  });

  it.each(ROLES as readonly Role[])("%s only sees result types their role may read", async (role) => {
    const { GET } = await route();
    session.state = as(role);
    const res = await GET(get(`/api/admin/search?q=${needle}`));
    expect(res.status).toBe(200);
    const types = new Set(((await res.json()) as { hits: { type: string }[] }).hits.map((h) => h.type));
    expect(types.has("product")).toBe(can(role, "products.read"));
    expect(types.has("support")).toBe(can(role, "support.read"));
  });

  it("short queries return nothing and wildcard characters are matched literally, not as patterns", async () => {
    const { GET } = await route();
    session.state = as("owner");
    expect(((await (await GET(get("/api/admin/search?q=a"))).json()) as { hits: unknown[] }).hits).toEqual([]);
    const pct = (await (await GET(get(`/api/admin/search?q=${encodeURIComponent("%%%")}`))).json()) as { hits: unknown[] };
    expect(pct.hits).toEqual([]);
    const us = (await (await GET(get(`/api/admin/search?q=${encodeURIComponent("__")}`))).json()) as { hits: unknown[] };
    expect(us.hits).toEqual([]);
  });
});

describe("GET /api/cron/maintenance", () => {
  const route = () => import("@/app/api/cron/maintenance/route");

  it.each([
    ["no Authorization header", {}],
    ["wrong secret", { authorization: "Bearer nope" }],
    ["secret without the Bearer scheme", { authorization: CRON_SECRET }],
    ["secret with trailing characters", { authorization: `Bearer ${CRON_SECRET}x` }],
    ["an empty bearer", { authorization: "Bearer " }],
  ])("refuses %s", async (_n, headers) => {
    const { GET } = await route();
    const res = await GET(get("/api/cron/maintenance", headers));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("a signed-in staff session is not a substitute for the cron secret", async () => {
    const { GET } = await route();
    session.state = as("owner");
    expect((await GET(get("/api/cron/maintenance"))).status).toBe(401);
  });

  it("runs maintenance with the correct secret", async () => {
    const { GET } = await route();
    const res = await GET(get("/api/cron/maintenance", { authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ chunks: expect.any(Number), purgedArtifacts: expect.any(Number) });
  });
});
