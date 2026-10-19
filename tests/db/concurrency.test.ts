import { afterAll, describe, expect, it } from "vitest";
import { generateToken, hashManualCode, hashToken } from "@/server/security/tokens";
import { admin, closePools, createLiveUnit, netHash, verify } from "./support/fixtures";

afterAll(closePools);

describe("concurrent verification", () => {
  it("25 simultaneous first scans: exactly one is 'first', counters are exact, no lost updates", async () => {
    const u = await createLiveUnit();
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => verify({ hash: hashToken(u.token), network: netHash(7), country: "LK", ua: i % 2 ? "ios" : "android" })),
    );
    const counts = results.reduce<Record<string, number>>((m, r) => ((m[r.result] = (m[r.result] ?? 0) + 1), m), {});
    expect(counts.recognized_first).toBe(1);
    expect(counts.recognized_first + (counts.recognized_repeat ?? 0) + (counts.suspicious ?? 0)).toBe(25);

    const unit = (await admin.query("select scan_count, first_verified_at from public.part_units where id = $1", [u.unit.id])).rows[0];
    expect(unit.scan_count).toBe(25);
    const ev = (await admin.query("select count(*)::int c from public.verification_events where unit_id = $1", [u.unit.id])).rows[0].c;
    expect(ev).toBe(25);
    // Only one open investigation despite many concurrent suspicious scans.
    const inv = (await admin.query("select count(*)::int c from public.investigations where unit_id = $1", [u.unit.id])).rows[0].c;
    expect(inv).toBeLessThanOrEqual(1);
  });

  it("scan_count stays consistent across 40 units scanned in parallel", async () => {
    const units = await Promise.all(Array.from({ length: 40 }, () => createLiveUnit()));
    const results = await Promise.all(units.map((u) => verify({ hash: hashToken(u.token) })));
    expect(results.every((r) => r.result === "recognized_first")).toBe(true);
    const { rows } = await admin.query("select scan_count from public.part_units where id = any($1::uuid[])", [units.map((u) => u.unit.id)]);
    expect(rows.every((r) => r.scan_count === 1)).toBe(true);
  });

  it("revocation during a burst of scans: once the revocation wins, no later scan can be recognised", async () => {
    const u = await createLiveUnit();
    const scans = Array.from({ length: 30 }, () => verify({ hash: hashToken(u.token), network: netHash(7) }));
    // Fire the revocation while scans are in flight.
    const revoke = new Promise<void>((resolve, reject) =>
      setTimeout(() => admin.query("select public.revoke_part_token($1, null, 'compromised during test')", [u.unit.id]).then(() => resolve(), reject), 2),
    );
    await Promise.all([...scans, revoke]);

    // Events are written under the unit row lock, so id order == serialisation order.
    const ev = (await admin.query("select id, result from public.verification_events where unit_id = $1 order by id", [u.unit.id])).rows;
    expect(ev).toHaveLength(30);
    const firstRevoked = ev.findIndex((e) => e.result === "revoked");
    if (firstRevoked >= 0) {
      for (const e of ev.slice(firstRevoked)) expect(e.result).toBe("revoked");
    }
    const unit = (await admin.query("select scan_count from public.part_units where id = $1", [u.unit.id])).rows[0];
    expect(unit.scan_count).toBe(ev.filter((e) => e.result !== "revoked").length);
  });

  it("two concurrent replacements for one unit leave exactly one active token", async () => {
    const u = await createLiveUnit();
    const attempt = () =>
      admin.query("select public.replace_part_token($1, $2, $3, null, 'concurrent replace')", [u.unit.id, hashToken(generateToken()), hashManualCode("ABCDEFGHJKMNPQRSTVW" + Math.floor(Math.random() * 10))]);
    const settled = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(settled.some((s) => s.status === "fulfilled")).toBe(true);
    const active = (await admin.query("select count(*)::int c from public.part_tokens where unit_id = $1 and status = 'active'", [u.unit.id])).rows[0].c;
    expect(active).toBe(1);
  });

  it("rate limiter: concurrent hits never exceed the limit", async () => {
    const key = `test:${Math.random()}`;
    const limit = 10;
    const hits = await Promise.all(
      Array.from({ length: 40 }, () => admin.query("select * from public.rate_limit_hit($1, 60, $2)", [key, limit]).then((r) => r.rows[0])),
    );
    expect(hits.filter((h) => h.allowed)).toHaveLength(limit);
    expect(hits.filter((h) => !h.allowed)).toHaveLength(30);
    expect(Math.min(...hits.map((h) => h.remaining))).toBe(0);
  });
});
