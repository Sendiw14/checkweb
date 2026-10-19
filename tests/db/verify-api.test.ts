import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateManualCode, generateToken, formatManualCode } from "@/server/security/tokens";
import { setLogSink } from "@/server/logger";
import { admin, closePools, createLiveUnit } from "./support/fixtures";
import { TEST_DB } from "./support/urls";

const base = `127.0.0.1:${process.env.TEST_PG_PORT ?? "5432"}/${TEST_DB}`;
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: `postgres://app_server:app_server_dev_pw@${base}`,
  VERIFIER_DATABASE_URL: `postgres://app_verifier:app_verifier_dev_pw@${base}`,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "a".repeat(40),
  SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40),
  PUBLIC_SITE_URL: "http://localhost:3000",
  NETWORK_HASH_PEPPER: "test-pepper-".padEnd(40, "x"),
  ARTIFACT_STORAGE: "local",
});

let POST: (r: Request) => Promise<Response>;
let closeAppPools: () => Promise<void>;
let n = 0;
const ip = () => `198.51.${100 + (n++ % 100)}.${Math.floor(Math.random() * 250) + 1}`;

const call = (body: unknown, headers: Record<string, string> = {}, raw?: string) =>
  POST(new Request("http://localhost:3000/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip(), "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)", ...headers },
    body: raw ?? JSON.stringify(body),
  }));

beforeAll(async () => {
  ({ POST } = await import("@/app/api/verify/route"));
  ({ closePools: closeAppPools } = await import("@/server/db/pool"));
});
afterAll(async () => {
  await closeAppPools();
  await closePools();
});

describe("POST /api/verify", () => {
  it("verifies a real token end to end with safe headers and an allow-listed body", async () => {
    const u = await createLiveUnit();
    const res = await call({ credential: u.token });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const body = await res.json();
    expect(body).toMatchObject({ status: "recognized_first", reference: u.unit.serial_number, product: { name: u.product.name, partNumber: u.product.part_number } });
    expect(Object.keys(body).sort()).toEqual(["product", "reference", "requestId", "status"]);
    expect(JSON.stringify(body)).not.toContain(u.token);

    const second = await (await call({ credential: u.token })).json();
    expect(second).toMatchObject({ status: "recognized_repeat", previousScanCount: 1 });
    expect(second.firstVerifiedAt).toBeTruthy();
  });

  it("accepts the printed manual code, with typing mistakes", async () => {
    const u = await createLiveUnit();
    const typed = formatManualCode(u.code).toLowerCase().replace(/0/g, "o");
    const body = await (await call({ credential: typed })).json();
    expect(body.status).toBe("recognized_first");
  });

  it("accepts a pasted verification URL", async () => {
    const u = await createLiveUnit();
    const body = await (await call({ credential: `https://verify.example.com/verify#${u.token}` })).json();
    expect(body.status).toBe("recognized_first");
  });

  it("returns 404/invalid for unknown credentials and records an unlinked event", async () => {
    const before = (await admin.query("select count(*)::int c from public.verification_events where result = 'invalid'")).rows[0].c;
    const res = await call({ credential: generateToken() });
    expect(res.status).toBe(404);
    expect((await res.json()).status).toBe("invalid");
    expect((await admin.query("select count(*)::int c from public.verification_events where result = 'invalid'")).rows[0].c).toBe(before + 1);
    expect((await call({ credential: formatManualCode(generateManualCode()) })).status).toBe(404);
  });

  it("rejects malformed input with 400/415/413 and never touches the verification table", async () => {
    const before = (await admin.query("select count(*)::int c from public.verification_events")).rows[0].c;
    for (const bad of [{}, { credential: "" }, { credential: 123 }, { credential: "short" }, { credential: null }, { credential: "x".repeat(600) }]) {
      const res = await call(bad);
      expect(res.status).toBe(400);
      expect((await res.json()).status).toBe("malformed");
    }
    expect((await call(null, {}, "{not json")).status).toBe(400);
    expect((await call(null, { "content-type": "text/plain" }, "credential=abc")).status).toBe(415);
    expect((await call(null, {}, JSON.stringify({ credential: "a".repeat(5000) }))).status).toBe(413);
    expect((await admin.query("select count(*)::int c from public.verification_events")).rows[0].c).toBe(before);
  });

  it("rate-limits per network (429 + Retry-After) without affecting other networks", async () => {
    const u = await createLiveUnit();
    const noisy = "203.0.113.77";
    let last: Response | undefined;
    for (let i = 0; i < 61; i++) last = await call({ credential: u.token }, { "x-real-ip": noisy });
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await last!.json()).status).toBe("rate_limited");
    expect((await call({ credential: u.token })).status).toBe(200);
  });

  it("stops answering a network that keeps submitting invalid codes", async () => {
    const guesser = "203.0.113.88";
    const statuses: number[] = [];
    for (let i = 0; i < 24; i++) statuses.push((await call({ credential: generateToken() }, { "x-real-ip": guesser })).status);
    expect(statuses.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    // ...and even a genuine token from that network is refused until the window passes.
    const u = await createLiveUnit();
    expect((await call({ credential: u.token }, { "x-real-ip": guesser })).status).toBe(429);
  });

  it("tags obvious bots as automated traffic that never changes customer counters", async () => {
    const u = await createLiveUnit();
    await call({ credential: u.token }, { "user-agent": "Slackbot-LinkExpanding 1.0" });
    const row = (await admin.query("select scan_count from public.part_units where id = $1", [u.unit.id])).rows[0];
    expect(row.scan_count).toBe(0);
    const ev = (await admin.query("select channel, ua_class from public.verification_events where unit_id = $1", [u.unit.id])).rows;
    expect(ev).toEqual([{ channel: "automated", ua_class: "bot" }]);
  });

  it("stores only hashed, coarse network data - never the raw address", async () => {
    const u = await createLiveUnit();
    const addr = "198.18.55.99";
    await call({ credential: u.token }, { "x-real-ip": addr, "x-vercel-ip-country": "lk" });
    const { rows } = await admin.query("select * from public.verification_events where unit_id = $1", [u.unit.id]);
    expect(rows[0].network_hash).toHaveLength(16);
    expect(rows[0].country).toBe("LK");
    expect(JSON.stringify(rows)).not.toContain(addr);
    expect(JSON.stringify(rows)).not.toContain("198.18.55");
  });
});

describe("failure behaviour", () => {
  it("answers 503 'unavailable' - never a success - when the database cannot be reached, and logs no credential", async () => {
    await closeAppPools(); // pools are process-global; drop the healthy ones first
    vi.resetModules();
    const saved = { ...process.env };
    process.env.VERIFIER_DATABASE_URL = "postgres://app_verifier:app_verifier_dev_pw@127.0.0.1:1/nowhere";
    process.env.DATABASE_URL = process.env.VERIFIER_DATABASE_URL;
    const lines: string[] = [];
    const { setLogSink: sink } = await import("@/server/logger");
    sink((l) => lines.push(l));
    try {
      const route = await import("@/app/api/verify/route");
      const token = generateToken();
      const res = await route.POST(new Request("http://localhost:3000/api/verify", {
        method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.18.1.1" }, body: JSON.stringify({ credential: token }),
      }));
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBe("30");
      const body = await res.json();
      expect(body.status).toBe("unavailable");
      expect(JSON.stringify(body)).not.toMatch(/recognized|product|reference/);
      expect(lines.join("\n")).toContain("verify.failed");
      expect(lines.join("\n")).not.toContain(token);
      const pool = await import("@/server/db/pool");
      await pool.closePools();
    } finally {
      Object.assign(process.env, saved);
      setLogSink((l) => process.stdout.write(l + "\n"));
    }
  });
});
