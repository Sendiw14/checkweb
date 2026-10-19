import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { generateToken, hashManualCode, hashToken } from "@/server/security/tokens";
import {
  type RawResult, admin, closePools, createBatch, createLiveUnit, createProduct, createUser, issueToken, netHash,
  registerUnits, releaseUnit, verify,
} from "./support/fixtures";

afterAll(closePools);

const events = async (unitId: string) =>
  (await admin.query("select * from public.verification_events where unit_id = $1 order by id", [unitId])).rows;
const unitRow = async (unitId: string) =>
  (await admin.query("select * from public.part_units where id = $1", [unitId])).rows[0];

describe("verify_part_token: outcomes", () => {
  it("returns invalid for an unknown token and records an event without a unit", async () => {
    const r = await verify({ hash: hashToken(generateToken()), network: netHash(1), country: "lk", ua: "ios" });
    expect(r.result).toBe("invalid");
    expect(r.unit).toBeUndefined();
    const { rows } = await admin.query("select * from public.verification_events where id = $1", [r.eventId]);
    expect(rows[0]).toMatchObject({ result: "invalid", unit_id: null, token_id: null, channel: "customer", country: "LK", ua_class: "ios" });
  });

  it("first scan is recognized_first, then recognized_repeat with prior info", async () => {
    const u = await createLiveUnit();
    const first = await verify({ hash: hashToken(u.token), network: netHash(1) });
    expect(first.result).toBe("recognized_first");
    expect(first.unit).toMatchObject({ serial: u.unit.serial_number, previousScanCount: 0, firstVerifiedAt: null });
    expect(first.product).toMatchObject({ name: u.product.name, partNumber: u.product.part_number });

    const second = await verify({ hash: hashToken(u.token), network: netHash(1) });
    expect(second.result).toBe("recognized_repeat");
    expect(second.unit.previousScanCount).toBe(1);
    expect(second.unit.firstVerifiedAt).not.toBeNull();

    const row = await unitRow(u.unit.id);
    expect(row.scan_count).toBe(2);
    expect(row.first_verified_at).not.toBeNull();
    expect(row.last_verified_at).not.toBeNull();
  });

  it("accepts the manual fallback code and counts it the same way", async () => {
    const u = await createLiveUnit();
    const r = await verify({ hash: hashManualCode(u.code), kind: "code" });
    expect(r.result).toBe("recognized_first");
    expect((await unitRow(u.unit.id)).scan_count).toBe(1);
    // A code hash must not be accepted as a token hash and vice versa.
    expect((await verify({ hash: hashManualCode(u.code), kind: "token" })).result).toBe("invalid");
    expect((await verify({ hash: hashToken(u.token), kind: "code" })).result).toBe("invalid");
  });

  it("QC and automated channels never change customer counters or open investigations", async () => {
    const u = await createLiveUnit();
    for (let i = 0; i < 8; i++) {
      await verify({ hash: hashToken(u.token), channel: "qc", network: netHash(i + 1), country: i % 2 ? "US" : "LK" });
      await verify({ hash: hashToken(u.token), channel: "automated" });
    }
    const row = await unitRow(u.unit.id);
    expect(row.scan_count).toBe(0);
    expect(row.first_verified_at).toBeNull();
    const inv = await admin.query("select 1 from public.investigations where unit_id = $1", [u.unit.id]);
    expect(inv.rowCount).toBe(0);
    // ...but the events are recorded and tagged, and a later customer scan is still the first.
    expect((await events(u.unit.id)).map((e) => e.channel)).toContain("qc");
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("recognized_first");
  });

  it("reports not_released until the unit is released", async () => {
    const product = await createProduct();
    const batch = await createBatch(product.id, 5);
    const [unit] = await registerUnits(batch.id, 1);
    const t = await issueToken(unit!.id);
    expect((await verify({ hash: hashToken(t.token) })).result).toBe("not_released");
    expect((await unitRow(unit!.id)).scan_count).toBe(0);
    await releaseUnit(unit!.id);
    expect((await verify({ hash: hashToken(t.token) })).result).toBe("recognized_first");
  });

  it("reports quarantined (unit and batch level) and recovers after restore", async () => {
    const u = await createLiveUnit();
    await admin.query("select public.transition_units('quarantined', null, 'suspected defect', null, $1::uuid[])", [[u.unit.id]]);
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("quarantined");
    await admin.query("select public.transition_units('restored', null, null, null, $1::uuid[])", [[u.unit.id]]);
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("recognized_first");

    await admin.query("select public.transition_units('quarantined', null, 'batch issue', $1, null)", [u.batch.id]);
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("quarantined");
    expect((await admin.query("select release_status from public.manufacturing_batches where id = $1", [u.batch.id])).rows[0].release_status).toBe("quarantined");
  });

  it("reports retired units", async () => {
    const u = await createLiveUnit();
    await admin.query("select public.transition_units('retired', null, 'scrapped', null, $1::uuid[])", [[u.unit.id]]);
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("retired");
  });

  it("reports revoked and replaced credentials; the replacement works", async () => {
    const u = await createLiveUnit();
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("recognized_first");

    const newToken = generateToken();
    const newCode = "ABCDEFGHJKMNPQRSTVWX";
    await admin.query("select public.replace_part_token($1, $2, $3, null, 'label damaged')", [u.unit.id, hashToken(newToken), hashManualCode(newCode)]);

    const old = await verify({ hash: hashToken(u.token) });
    expect(old.result).toBe("revoked");
    expect(old.product).toBeTruthy(); // API layer decides what to expose
    // The unit's label must be re-applied before the new credential is on a part, but the
    // credential itself is live as soon as it is issued and the unit is released.
    expect((await verify({ hash: hashToken(newToken) })).result).toBe("recognized_repeat");

    const tokens = await admin.query("select status from public.part_tokens where unit_id = $1 order by issued_at", [u.unit.id]);
    expect(tokens.rows.map((r) => r.status).sort()).toEqual(["active", "replaced"]);
  });

  it("revocation without replacement leaves the unit with no live credential", async () => {
    const u = await createLiveUnit();
    await admin.query("select public.revoke_part_token($1, null, 'token leaked')", [u.unit.id]);
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("revoked");
    expect((await admin.query("select count(*)::int c from public.part_tokens where unit_id = $1 and status = 'active'", [u.unit.id])).rows[0].c).toBe(0);
  });
});

describe("verify_part_token: recalls", () => {
  async function recall(scope: "unit" | "batch" | "product", u: Awaited<ReturnType<typeof createLiveUnit>>, status: "active" | "draft" | "closed" = "active") {
    const ins = await admin.query(
      `insert into public.recalls (title, reason, status, public_instructions, instructions_approved_at, issued_at, closed_at)
       values ('Brake pad recall', 'Friction material defect', $1, $2, $3, $4, $5) returning id`,
      [
        status,
        status === "draft" ? null : "Stop using this part and contact support.",
        status === "draft" ? null : new Date(),
        status === "draft" ? null : new Date(),
        status === "closed" ? new Date() : null,
      ],
    );
    const id = ins.rows[0].id;
    if (scope === "unit") await admin.query("insert into public.recall_units values ($1, $2)", [id, u.unit.id]);
    if (scope === "batch") await admin.query("insert into public.recall_batches values ($1, $2)", [id, u.batch.id]);
    if (scope === "product") await admin.query("insert into public.recall_products values ($1, $2)", [id, u.product.id]);
    return id as string;
  }

  for (const scope of ["unit", "batch", "product"] as const) {
    it(`an active recall scoped to a ${scope} is enforced and returns the approved instructions`, async () => {
      const u = await createLiveUnit();
      await recall(scope, u);
      const r = await verify({ hash: hashToken(u.token) });
      expect(r.result).toBe("recalled");
      expect(r.recall).toMatchObject({ title: "Brake pad recall", instructions: "Stop using this part and contact support." });
      expect((await unitRow(u.unit.id)).scan_count).toBe(0);
    });
  }

  it("draft and closed recalls do not affect verification", async () => {
    const u = await createLiveUnit();
    await recall("unit", u, "draft");
    await recall("unit", u, "closed");
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("recognized_first");
  });

  it("a recall cannot be activated without approved customer instructions", async () => {
    await expect(
      admin.query(`insert into public.recalls (title, reason, status) values ('x y z', 'reason', 'active')`),
    ).rejects.toThrow(/violates check constraint/);
    await expect(
      admin.query(`insert into public.recalls (title, reason, status, public_instructions, issued_at) values ('x y z', 'reason', 'active', 'do this', now())`),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("revoked beats recalled (the credential itself is withdrawn)", async () => {
    const u = await createLiveUnit();
    await recall("batch", u);
    await admin.query("select public.revoke_part_token($1, null, 'withdrawn')", [u.unit.id]);
    expect((await verify({ hash: hashToken(u.token) })).result).toBe("revoked");
  });
});

describe("verify_part_token: explainable risk rules", () => {
  it("does not flag a handful of ordinary repeat scans from one network", async () => {
    const u = await createLiveUnit();
    const results: string[] = [];
    for (let i = 0; i < 4; i++) results.push((await verify({ hash: hashToken(u.token), network: netHash(7), country: "LK" })).result);
    expect(results).toEqual(["recognized_first", "recognized_repeat", "recognized_repeat", "recognized_repeat"]);
    expect((await admin.query("select 1 from public.investigations where unit_id = $1", [u.unit.id])).rowCount).toBe(0);
  });

  it("rapid_repeat: the 5th customer scan in 10 minutes is suspicious, with reasons", async () => {
    const u = await createLiveUnit();
    let last = {} as RawResult;
    for (let i = 0; i < 5; i++) last = await verify({ hash: hashToken(u.token), network: netHash(7) });
    expect(last.result).toBe("suspicious");
    expect(last.riskReasons).toEqual(["rapid_repeat"]);
    const ev = (await events(u.unit.id)).at(-1);
    expect(ev).toMatchObject({ result: "suspicious", risk_score: 2, risk_reasons: ["rapid_repeat"] });
  });

  it("many_networks: three distinct networks within 24h is suspicious", async () => {
    const u = await createLiveUnit();
    expect((await verify({ hash: hashToken(u.token), network: netHash(1) })).result).toBe("recognized_first");
    expect((await verify({ hash: hashToken(u.token), network: netHash(2) })).result).toBe("recognized_repeat");
    const r = await verify({ hash: hashToken(u.token), network: netHash(3) });
    expect(r.result).toBe("suspicious");
    expect(r.riskReasons).toEqual(["many_networks"]);
  });

  it("many_countries: two countries within 24h is suspicious", async () => {
    const u = await createLiveUnit();
    await verify({ hash: hashToken(u.token), network: netHash(1), country: "LK" });
    const r = await verify({ hash: hashToken(u.token), network: netHash(1), country: "DE" });
    expect(r.result).toBe("suspicious");
    expect(r.riskReasons).toEqual(["many_countries"]);
  });

  it("opens exactly one automatic investigation per unit, however many suspicious scans follow", async () => {
    const u = await createLiveUnit();
    for (let i = 0; i < 9; i++) await verify({ hash: hashToken(u.token), network: netHash(7) });
    const inv = await admin.query("select * from public.investigations where unit_id = $1", [u.unit.id]);
    expect(inv.rowCount).toBe(1);
    expect(inv.rows[0]).toMatchObject({ origin: "risk_rule", status: "open" });
    expect(inv.rows[0].summary).toMatch(/^Automatic:/);
  });

  it("scoring multiple rules at once is high severity", async () => {
    const u = await createLiveUnit();
    for (let i = 1; i <= 5; i++) await verify({ hash: hashToken(u.token), network: netHash(i), country: i % 2 ? "LK" : "DE" });
    const inv = await admin.query("select severity, risk_reasons from public.investigations where unit_id = $1", [u.unit.id]);
    expect(inv.rows[0].severity).toBe("high");
    expect(inv.rows[0].risk_reasons).toEqual(expect.arrayContaining(["rapid_repeat", "many_networks", "many_countries"]));
  });

  it("revoked_scans: a withdrawn credential presented 3 times opens a low-severity case", async () => {
    const u = await createLiveUnit();
    await admin.query("select public.revoke_part_token($1, null, 'compromised')", [u.unit.id]);
    for (let i = 0; i < 3; i++) await verify({ hash: hashToken(u.token), network: netHash(9) });
    const inv = await admin.query("select severity, risk_reasons from public.investigations where unit_id = $1", [u.unit.id]);
    expect(inv.rowCount).toBe(1);
    expect(inv.rows[0]).toMatchObject({ severity: "low", risk_reasons: ["revoked_scans"] });
  });

  it("thresholds come from app_settings, so they are explainable and tunable", async () => {
    const u = await createLiveUnit();
    await admin.query(`update public.app_settings set risk_thresholds = risk_thresholds || '{"rapidScans": 2}'::jsonb`);
    try {
      await verify({ hash: hashToken(u.token), network: netHash(7) });
      expect((await verify({ hash: hashToken(u.token), network: netHash(7) })).result).toBe("suspicious");
    } finally {
      await admin.query(`update public.app_settings set risk_thresholds = risk_thresholds || '{"rapidScans": 5}'::jsonb`);
    }
  });
});

describe("verify_part_token: argument validation and data hygiene", () => {
  it("rejects malformed arguments", async () => {
    await expect(admin.query("select public.verify_part_token($1, 'token', 'customer', $2)", [Buffer.alloc(5), randomUUID()])).rejects.toThrow(/invalid verification arguments/);
    await expect(admin.query("select public.verify_part_token($1, 'nope', 'customer', $2)", [Buffer.alloc(32), randomUUID()])).rejects.toThrow(/invalid verification arguments/);
    await expect(admin.query("select public.verify_part_token($1, 'token', 'customer', 'short')", [Buffer.alloc(32)])).rejects.toThrow(/invalid verification arguments/);
  });

  it("never stores the plaintext token or code anywhere in events", async () => {
    const u = await createLiveUnit();
    await verify({ hash: hashToken(u.token) });
    const dump = JSON.stringify((await admin.query("select * from public.verification_events where unit_id = $1", [u.unit.id])).rows);
    expect(dump).not.toContain(u.token);
    expect(dump).not.toContain(u.code);
    const tokens = JSON.stringify((await admin.query("select * from public.part_tokens where unit_id = $1", [u.unit.id])).rows);
    expect(tokens).not.toContain(u.token);
  });

  it("stores the QC actor in metadata only", async () => {
    const u = await createLiveUnit();
    const actor = await createUser();
    const { rows } = await admin.query("select public.verify_part_token($1, 'token', 'qc', $2, null, null, null, $3) as r", [hashToken(u.token), randomUUID(), actor.id]);
    const ev = (await admin.query("select metadata from public.verification_events where id = $1", [rows[0].r.eventId])).rows[0];
    expect(ev.metadata).toEqual({ actor: actor.id });
  });
});
