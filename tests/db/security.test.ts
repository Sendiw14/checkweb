import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "@/server/security/tokens";
import { admin, appServer, asRole, closePools, createLiveUnit, createStaff, verifier } from "./support/fixtures";

afterAll(closePools);

let owner: { id: string };
let production: { id: string };
let support: { id: string };
let auditor: { id: string };
let suspended: { id: string };
let outsider: { id: string };

beforeAll(async () => {
  await createLiveUnit(); // make sure there are rows to (not) see
  owner = await createStaff("owner");
  production = await createStaff("production_operator");
  support = await createStaff("support_agent");
  auditor = await createStaff("auditor");
  suspended = await createStaff("admin", "suspended");
  outsider = { id: randomUUID() };
  await admin.query("insert into auth.users (id, email) values ($1, 'outsider@example.test')", [outsider.id]);
  await admin.query("insert into public.audit_logs (action) values ('seed.audit')");
  await admin.query("insert into public.support_cases (kind, subject, message, contact_email) values ('question', 'hello there', 'a message', 'c@example.test')");
});

const count = async (role: "anon" | "authenticated", sub: string | null, table: string) =>
  asRole(role, sub, async (c) => Number((await c.query(`select count(*) from public.${table}`)).rows[0].count));

describe("Data API: anon", () => {
  it("cannot read anything", async () => {
    for (const t of ["products", "part_units", "part_tokens", "verification_events", "audit_logs", "support_cases", "app_settings"]) {
      await expect(count("anon", null, t)).rejects.toThrow(/permission denied/);
    }
  });
});

describe("Data API: authenticated users without an active staff membership", () => {
  it("see zero rows everywhere (RLS), including suspended staff", async () => {
    for (const who of [outsider.id, suspended.id]) {
      for (const t of ["products", "manufacturing_batches", "part_units", "verification_events", "support_cases", "audit_logs", "app_settings", "recalls"]) {
        expect(await count("authenticated", who, t)).toBe(0);
      }
    }
  });
});

describe("Data API: role-scoped reads", () => {
  it("production operators read catalogue data but not audit logs, support cases or events", async () => {
    expect(await count("authenticated", production.id, "products")).toBeGreaterThan(0);
    expect(await count("authenticated", production.id, "part_units")).toBeGreaterThan(0);
    expect(await count("authenticated", production.id, "audit_logs")).toBe(0);
    expect(await count("authenticated", production.id, "support_cases")).toBe(0);
    expect(await count("authenticated", production.id, "verification_events")).toBe(0);
  });

  it("support agents read support cases and events; auditors read audit logs; owners read memberships", async () => {
    expect(await count("authenticated", support.id, "support_cases")).toBeGreaterThan(0);
    expect(await count("authenticated", support.id, "audit_logs")).toBe(0);
    expect(await count("authenticated", auditor.id, "audit_logs")).toBeGreaterThan(0);
    expect(await count("authenticated", owner.id, "audit_logs")).toBeGreaterThan(0);
    expect(await count("authenticated", owner.id, "admin_memberships")).toBeGreaterThan(3);
    // non-admin staff only see their own membership row
    expect(await count("authenticated", production.id, "admin_memberships")).toBe(1);
  });

  it("network identifiers and token hashes are not readable through the Data API, even by owners", async () => {
    await expect(asRole("authenticated", owner.id, (c) => c.query("select network_hash from public.verification_events"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", owner.id, (c) => c.query("select * from public.part_tokens"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", owner.id, (c) => c.query("select token_hash from public.part_tokens"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", owner.id, (c) => c.query("select * from public.label_job_artifacts"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", owner.id, (c) => c.query("select * from public.rate_limit_counters"))).rejects.toThrow(/permission denied/);
    // columns we do grant still work
    await asRole("authenticated", owner.id, (c) => c.query("select id, result, channel, country from public.verification_events limit 1"));
  });
});

describe("Data API: no writes, no privileged functions", () => {
  it("authenticated owners cannot insert, update or delete via the Data API", async () => {
    await expect(asRole("authenticated", owner.id, (c) => c.query("insert into public.products (sku, part_number, name) values ('HACK-1', 'HACK-1', 'hack')"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", owner.id, (c) => c.query("update public.part_units set scan_count = 0"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", owner.id, (c) => c.query("delete from public.audit_logs"))).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", owner.id, (c) => c.query("update public.admin_memberships set role = 'owner'"))).rejects.toThrow(/permission denied/);
  });

  it("no function in the public schema is executable by PUBLIC, anon or authenticated", async () => {
    const { rows } = await admin.query(`
      select p.oid::regprocedure::text as fn,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('public', p.oid, 'execute') as pub
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'`);
    expect(rows.length).toBeGreaterThan(10);
    const exposed = rows.filter((r) => r.anon || r.authenticated || r.pub).map((r) => r.fn);
    expect(exposed).toEqual([]);
  });

  it("every table in public has row level security enabled", async () => {
    const { rows } = await admin.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});

describe("app_verifier (public verification role)", () => {
  it("can execute exactly verify_part_token and rate_limit_hit", async () => {
    const u = await createLiveUnit();
    const { rows } = await verifier.query("select public.verify_part_token($1, 'token', 'customer', $2) as r", [hashToken(u.token), randomUUID()]);
    expect(rows[0].r.result).toBe("recognized_first");
    expect((await verifier.query("select * from public.rate_limit_hit($1, 60, 5)", [randomUUID()])).rows[0].allowed).toBe(true);

    await expect(verifier.query("select public.register_batch_units($1, 1)", [randomUUID()])).rejects.toThrow(/permission denied/);
    await expect(verifier.query("select public.purge_expired_data()")).rejects.toThrow(/permission denied/);
    await expect(verifier.query("select public.revoke_part_token($1, null, 'x')", [u.unit.id])).rejects.toThrow(/permission denied/);
  });

  it("cannot read or write any table directly", async () => {
    for (const t of ["part_units", "part_tokens", "products", "verification_events", "audit_logs", "app_settings"]) {
      await expect(verifier.query(`select 1 from public.${t} limit 1`)).rejects.toThrow(/permission denied/);
    }
    await expect(verifier.query("update public.part_units set scan_count = 99")).rejects.toThrow(/permission denied/);
    await expect(verifier.query("insert into public.verification_events (result, channel, request_id) values ('invalid', 'customer', 'aaaaaaaa')")).rejects.toThrow(/permission denied/);
  });
});

describe("app_server (admin application role)", () => {
  it("cannot read token hashes or raw-write sensitive tables", async () => {
    await expect(appServer.query("select token_hash from public.part_tokens limit 1")).rejects.toThrow(/permission denied/);
    await expect(appServer.query("select code_hash from public.part_tokens limit 1")).rejects.toThrow(/permission denied/);
    await appServer.query("select id, unit_id, status from public.part_tokens limit 1");
    await expect(appServer.query("update public.part_units set scan_count = 0")).rejects.toThrow(/permission denied/);
    await expect(appServer.query("insert into public.part_units (product_id, batch_id, serial_number) values (gen_random_uuid(), gen_random_uuid(), 'X-1')")).rejects.toThrow(/permission denied/);
    await expect(appServer.query("insert into public.verification_events (result, channel, request_id) values ('invalid', 'customer', 'bbbbbbbb')")).rejects.toThrow(/permission denied/);
    await expect(appServer.query("update public.audit_logs set action = 'x'")).rejects.toThrow(/permission denied/);
    await expect(appServer.query("delete from public.audit_logs")).rejects.toThrow(/permission denied/);
    await expect(appServer.query("update public.manufacturing_batches set release_status = 'released'")).rejects.toThrow(/permission denied/);
  });

  it("can do its job: manage catalogue rows, append audit entries, call the controlled functions", async () => {
    const p = await appServer.query(
      "insert into public.products (sku, part_number, name) values ($1, $2, 'App Server Product') returning id",
      [`APP-${Date.now()}`, `APPPN-${Date.now()}`],
    );
    await appServer.query("update public.products set description = 'edited' where id = $1", [p.rows[0].id]);
    await appServer.query("insert into public.audit_logs (action, target_type, target_id) values ('product.create', 'product', $1)", [p.rows[0].id]);
    const b = await appServer.query(
      "insert into public.manufacturing_batches (product_id, batch_code, manufacturing_date, expected_quantity) values ($1, $2, current_date, 3) returning id",
      [p.rows[0].id, `APPB-${Date.now()}`],
    );
    expect((await appServer.query("select public.register_batch_units($1, 3) as n", [b.rows[0].id])).rows[0].n).toBe(3);
  });
});

describe("storage buckets migration is a no-op without Supabase storage", () => {
  it("applied cleanly on plain Postgres", async () => {
    const { rows } = await admin.query("select count(*)::int c from supabase_migrations.schema_migrations");
    expect(rows[0].c).toBeGreaterThanOrEqual(3);
  });
});
