import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { generateToken, hashManualCode, hashToken } from "@/server/security/tokens";
import {
  admin, closePools, createBatch, createLiveUnit, createProduct, createStaff, createUser, issueToken, registerUnits, releaseUnit,
} from "./support/fixtures";

afterAll(closePools);

describe("uniqueness and constraints", () => {
  it("SKU and part number are unique; lower-case spellings are rejected outright", async () => {
    const p = await createProduct();
    await expect(createProduct({ sku: p.sku })).rejects.toThrow(/products_sku_key/);
    await expect(createProduct({ part_number: p.part_number })).rejects.toThrow(/products_part_number_key/);
    await expect(createProduct({ sku: p.sku.toLowerCase() })).rejects.toThrow(/check constraint/);
  });

  it("rejects badly formatted SKUs and part numbers", async () => {
    await expect(createProduct({ sku: "bad sku!" })).rejects.toThrow(/check constraint/);
    await expect(createProduct({ part_number: "x" })).rejects.toThrow(/check constraint/);
  });

  it("batch codes are globally unique (even across products)", async () => {
    const b = await createBatch((await createProduct()).id, 10);
    await expect(createBatch((await createProduct()).id, 10, { batch_code: b.batch_code })).rejects.toThrow(/manufacturing_batches_code_key/);
    await expect(createBatch(b.product_id, 10, { batch_code: b.batch_code.toLowerCase() })).rejects.toThrow(/check constraint/);
  });

  it("token hashes are unique and must be 32 bytes", async () => {
    const u = await createLiveUnit();
    const p = await createProduct();
    const b = await createBatch(p.id, 5);
    const [other] = await registerUnits(b.id, 1);
    const dup = (await admin.query("select token_hash, code_hash from public.part_tokens where unit_id = $1", [u.unit.id])).rows[0];
    await expect(
      admin.query("insert into public.part_tokens (unit_id, token_hash, code_hash) values ($1, $2, $3)", [other!.id, dup.token_hash, hashManualCode("0000000000000000000A")]),
    ).rejects.toThrow(/part_tokens_token_hash_key/);
    await expect(
      admin.query("insert into public.part_tokens (unit_id, token_hash, code_hash) values ($1, $2, $3)", [other!.id, hashToken(generateToken()), dup.code_hash]),
    ).rejects.toThrow(/part_tokens_code_hash_key/);
    await expect(
      admin.query("insert into public.part_tokens (unit_id, token_hash, code_hash) values ($1, $2, $3)", [other!.id, Buffer.alloc(10), hashManualCode("0000000000000000000B")]),
    ).rejects.toThrow(/check constraint/);
  });

  it("a unit can never have two active tokens, but can after revocation", async () => {
    const u = await createLiveUnit();
    await expect(
      admin.query("insert into public.part_tokens (unit_id, token_hash, code_hash) values ($1, $2, $3)", [u.unit.id, hashToken(generateToken()), hashManualCode("0000000000000000000C")]),
    ).rejects.toThrow(/part_tokens_one_active_per_unit/);
    await admin.query("select public.revoke_part_token($1, null, 'rotate')", [u.unit.id]);
    await admin.query("insert into public.part_tokens (unit_id, token_hash, code_hash) values ($1, $2, $3)", [u.unit.id, hashToken(generateToken()), hashManualCode("0000000000000000000D")]);
  });

  it("issuing a second token for a unit that already has one is refused", async () => {
    const u = await createLiveUnit();
    await expect(issueToken(u.unit.id)).rejects.toThrow(/already have an active token/);
  });

  it("units cannot reference a batch of a different product", async () => {
    const p1 = await createProduct();
    const p2 = await createProduct();
    const b = await createBatch(p1.id, 5);
    await expect(
      admin.query("insert into public.part_units (product_id, batch_id, serial_number) values ($1, $2, 'ZZ-MISMATCH-1')", [p2.id, b.id]),
    ).rejects.toThrow(/foreign key/);
  });

  it("products with batches cannot be deleted (history is preserved)", async () => {
    const p = await createProduct();
    await createBatch(p.id, 5);
    await expect(admin.query("delete from public.products where id = $1", [p.id])).rejects.toThrow(/foreign key/);
  });
});

describe("register_batch_units", () => {
  it("creates globally unique, well-formed serials and never exceeds the expected quantity", async () => {
    const p = await createProduct();
    const b = await createBatch(p.id, 5);
    const units = await registerUnits(b.id, 3);
    expect(units).toHaveLength(3);
    for (const u of units) expect(u.serial_number).toMatch(/^[A-Z0-9]{2,6}-\d{8}$/);
    await expect(admin.query("select public.register_batch_units($1, 3)", [b.id])).rejects.toThrow(/exceed the expected quantity/);
    await admin.query("select public.register_batch_units($1, 2)", [b.id]);
    const { rows } = await admin.query("select count(*)::int c, count(distinct serial_number)::int d from public.part_units where batch_id = $1", [b.id]);
    expect(rows[0]).toEqual({ c: 5, d: 5 });
    expect((await admin.query("select processing_status from public.manufacturing_batches where id = $1", [b.id])).rows[0].processing_status).toBe("in_production");
  });

  it("registers 10,000 units in one call quickly, with all serials unique", async () => {
    const p = await createProduct();
    const b = await createBatch(p.id, 10_000);
    const t0 = Date.now();
    await admin.query("select public.register_batch_units($1, 10000)", [b.id]);
    const ms = Date.now() - t0;
    const { rows } = await admin.query("select count(*)::int c, count(distinct serial_number)::int d from public.part_units where batch_id = $1", [b.id]);
    expect(rows[0]).toEqual({ c: 10_000, d: 10_000 });
    expect(ms).toBeLessThan(10_000);
  });

  it("rejects bad quantities and closed batches", async () => {
    const p = await createProduct();
    const b = await createBatch(p.id, 5);
    await expect(admin.query("select public.register_batch_units($1, 0)", [b.id])).rejects.toThrow(/quantity/);
    await admin.query("update public.manufacturing_batches set processing_status = 'cancelled' where id = $1", [b.id]);
    await expect(admin.query("select public.register_batch_units($1, 1)", [b.id])).rejects.toThrow(/cannot receive new units/);
    await expect(admin.query("select public.register_batch_units($1, 1)", [randomUUID()])).rejects.toThrow(/batch not found/);
  });
});

describe("unit state machines", () => {
  async function fresh() {
    const p = await createProduct();
    const b = await createBatch(p.id, 5);
    const [unit] = await registerUnits(b.id, 1);
    return { p, b, unit: unit! };
  }

  it("identity fields are immutable", async () => {
    const { unit, b } = await fresh();
    await expect(admin.query("update public.part_units set serial_number = 'HACK-0001' where id = $1", [unit.id])).rejects.toThrow(/immutable/);
    const other = await createBatch((await createProduct()).id, 5);
    await expect(admin.query("update public.part_units set batch_id = $1 where id = $2", [other.id, unit.id])).rejects.toThrow(/immutable|foreign key/);
    expect(b.id).toBeTruthy();
  });

  it("cannot release before the label is confirmed as applied, nor without a token", async () => {
    const { unit } = await fresh();
    await admin.query("select public.transition_units('qc_passed', null, null, null, $1::uuid[])", [[unit.id]]);
    // direct update bypassing the function is still blocked by the guard
    await expect(admin.query("update public.part_units set lifecycle_status = 'released' where id = $1", [unit.id])).rejects.toThrow(/label is confirmed as applied/);
    // via the function the unit is simply skipped
    const skipped = (await admin.query("select public.transition_units('released', null, null, null, $1::uuid[]) as r", [[unit.id]])).rows[0].r;
    expect(skipped).toMatchObject({ requested: 1, changed: 0, skipped: 1 });
    // applied label but no token (force the label state to isolate the token rule)
    await admin.query("alter table public.part_units disable trigger part_units_guard");
    await admin.query("update public.part_units set label_status = 'applied' where id = $1", [unit.id]);
    await admin.query("alter table public.part_units enable trigger part_units_guard");
    await expect(admin.query("update public.part_units set lifecycle_status = 'released' where id = $1", [unit.id])).rejects.toThrow(/without an active token/);
  });

  it("enforces the lifecycle graph: retired is terminal, no skipping QC", async () => {
    const { unit } = await fresh();
    await expect(admin.query("update public.part_units set lifecycle_status = 'released' where id = $1", [unit.id])).rejects.toThrow(/illegal lifecycle transition/);
    await admin.query("select public.transition_units('retired', null, 'scrapped in test', null, $1::uuid[])", [[unit.id]]);
    await expect(admin.query("update public.part_units set lifecycle_status = 'registered' where id = $1", [unit.id])).rejects.toThrow(/illegal lifecycle transition/);
  });

  it("label status moves forward only (issue -> printed -> applied), and reissue resets to issued", async () => {
    const { unit } = await fresh();
    await expect(admin.query("select public.set_label_status($1::uuid[], 'applied', null)", [[unit.id]])).resolves.toBeTruthy(); // skipped: not printed yet
    expect((await admin.query("select label_status from public.part_units where id = $1", [unit.id])).rows[0].label_status).toBe("unlabelled");
    await issueToken(unit.id);
    expect((await admin.query("select label_status from public.part_units where id = $1", [unit.id])).rows[0].label_status).toBe("issued");
    await admin.query("select public.set_label_status($1::uuid[], 'printed', null)", [[unit.id]]);
    await admin.query("select public.set_label_status($1::uuid[], 'applied', null)", [[unit.id]]);
    await expect(admin.query("update public.part_units set label_status = 'printed' where id = $1", [unit.id])).rejects.toThrow(/illegal label transition/);
    await admin.query("select public.replace_part_token($1, $2, $3, null, 'label scuffed')", [unit.id, hashToken(generateToken()), hashManualCode("0000000000000000000E")]);
    expect((await admin.query("select label_status from public.part_units where id = $1", [unit.id])).rows[0].label_status).toBe("issued");
  });

  it("quarantine remembers and restores the previous state; restore downgrades if the token was revoked", async () => {
    const u = await createLiveUnit();
    await admin.query("select public.transition_units('quarantined', null, 'inspection', null, $1::uuid[])", [[u.unit.id]]);
    let row = (await admin.query("select lifecycle_status, lifecycle_before_quarantine from public.part_units where id = $1", [u.unit.id])).rows[0];
    expect(row).toEqual({ lifecycle_status: "quarantined", lifecycle_before_quarantine: "released" });
    await admin.query("select public.revoke_part_token($1, null, 'revoked while quarantined')", [u.unit.id]);
    await admin.query("select public.transition_units('restored', null, null, null, $1::uuid[])", [[u.unit.id]]);
    row = (await admin.query("select lifecycle_status, lifecycle_before_quarantine from public.part_units where id = $1", [u.unit.id])).rows[0];
    expect(row).toEqual({ lifecycle_status: "qc_passed", lifecycle_before_quarantine: null });
  });

  it("requires reasons for quarantine and retirement", async () => {
    const { unit } = await fresh();
    await expect(admin.query("select public.transition_units('quarantined', null, null, null, $1::uuid[])", [[unit.id]])).rejects.toThrow(/reason is required/);
    await expect(admin.query("select public.transition_units('retired', null, '', null, $1::uuid[])", [[unit.id]])).rejects.toThrow(/reason is required/);
  });
});

describe("batch-level operations", () => {
  it("QC -> release -> quarantine -> restore keep batch status consistent", async () => {
    const p = await createProduct();
    const b = await createBatch(p.id, 6);
    const units = await registerUnits(b.id, 6);
    for (const u of units) await issueToken(u.id);
    const ids = units.map((u) => u.id);
    await admin.query("select public.set_label_status($1::uuid[], 'printed', null)", [ids]);
    // only 4 of 6 labels confirmed as applied
    await admin.query("select public.set_label_status($1::uuid[], 'applied', null)", [ids.slice(0, 4)]);
    const qc = (await admin.query("select public.transition_units('qc_passed', null, null, $1, null) as r", [b.id])).rows[0].r;
    expect(qc).toMatchObject({ requested: 6, changed: 6 });
    const rel = (await admin.query("select public.transition_units('released', null, null, $1, null) as r", [b.id])).rows[0].r;
    expect(rel).toMatchObject({ requested: 6, changed: 4, skipped: 2 });
    let batch = (await admin.query("select release_status, approved_at from public.manufacturing_batches where id = $1", [b.id])).rows[0];
    expect(batch.release_status).toBe("released");
    expect(batch.approved_at).not.toBeNull();

    await admin.query("select public.transition_units('quarantined', null, 'recall prep', $1, null)", [b.id]);
    batch = (await admin.query("select release_status from public.manufacturing_batches where id = $1", [b.id])).rows[0];
    expect(batch.release_status).toBe("quarantined");
    await expect(admin.query("select public.transition_units('released', null, null, $1, null)", [b.id])).rejects.toThrow(/quarantined and cannot be released/);

    await admin.query("select public.transition_units('restored', null, null, $1, null)", [b.id]);
    batch = (await admin.query("select release_status from public.manufacturing_batches where id = $1", [b.id])).rows[0];
    expect(batch.release_status).toBe("released");
    const states = (await admin.query("select lifecycle_status, count(*)::int c from public.part_units where batch_id = $1 group by 1 order by 1", [b.id])).rows;
    expect(states).toEqual([{ lifecycle_status: "qc_passed", c: 2 }, { lifecycle_status: "released", c: 4 }]);
  });

  it("releasing individual units also advances their batch to released", async () => {
    const p = await createProduct();
    const b = await createBatch(p.id, 2);
    const units = await registerUnits(b.id, 2);
    for (const u of units) await issueToken(u.id);
    const ids = units.map((u) => u.id);
    await admin.query("select public.set_label_status($1::uuid[], 'printed', null)", [ids]);
    await admin.query("select public.set_label_status($1::uuid[], 'applied', null)", [ids]);
    await admin.query("select public.transition_units('qc_passed', null, null, null, $1::uuid[])", [ids]);
    expect((await admin.query("select release_status from public.manufacturing_batches where id = $1", [b.id])).rows[0].release_status).toBe("pending");
    await admin.query("select public.transition_units('released', null, null, null, $1::uuid[])", [[ids[0]]]);
    const row = (await admin.query("select release_status, approved_at from public.manufacturing_batches where id = $1", [b.id])).rows[0];
    expect(row.release_status).toBe("released");
    expect(row.approved_at).not.toBeNull();
  });

  it("QC hold blocks release and registering units", async () => {
    const p = await createProduct();
    const b = await createBatch(p.id, 4);
    await registerUnits(b.id, 1);
    await admin.query("select public.set_batch_qc_hold($1, true)", [b.id]);
    await expect(admin.query("select public.register_batch_units($1, 1)", [b.id])).rejects.toThrow(/cannot receive new units/);
    await expect(admin.query("select public.set_batch_qc_hold($1, true)", [b.id])).rejects.toThrow(/only a pending batch/);
    await admin.query("select public.set_batch_qc_hold($1, false)", [b.id]);
    await admin.query("select public.register_batch_units($1, 1)", [b.id]);
  });
});

describe("staff, append-only logs and audit hygiene", () => {
  it("protects the last active owner", async () => {
    await admin.query("delete from public.admin_memberships");
    const owner = await createStaff("owner");
    await expect(admin.query("update public.admin_memberships set role = 'admin' where user_id = $1", [owner.id])).rejects.toThrow(/last active owner/);
    await expect(admin.query("update public.admin_memberships set status = 'suspended' where user_id = $1", [owner.id])).rejects.toThrow(/last active owner/);
    await expect(admin.query("delete from public.admin_memberships where user_id = $1", [owner.id])).rejects.toThrow(/last active owner/);
    const second = await createStaff("owner");
    await admin.query("update public.admin_memberships set role = 'admin' where user_id = $1", [owner.id]);
    await expect(admin.query("update public.admin_memberships set role = 'admin' where user_id = $1", [second.id])).rejects.toThrow(/last active owner/);
  });

  it("audit logs and verification events are append-only, even for a superuser", async () => {
    const ins = await admin.query("insert into public.audit_logs (action, target_type, target_id) values ('test.action', 'unit', '1') returning id");
    await expect(admin.query("update public.audit_logs set action = 'tampered' where id = $1", [ins.rows[0].id])).rejects.toThrow(/append-only/);
    await expect(admin.query("delete from public.audit_logs where id = $1", [ins.rows[0].id])).rejects.toThrow(/append-only/);
    const u = await createLiveUnit();
    const { verify } = await import("./support/fixtures");
    const r = await verify({ hash: hashToken(u.token) });
    await expect(admin.query("update public.verification_events set result = 'invalid' where id = $1", [r.eventId])).rejects.toThrow(/append-only/);
    await expect(admin.query("delete from public.verification_events where id = $1", [r.eventId])).rejects.toThrow(/append-only/);
  });

  it("audit metadata may not carry credentials", async () => {
    const insert = (meta: unknown) => admin.query("insert into public.audit_logs (action, metadata) values ('test.meta', $1)", [JSON.stringify(meta)]);
    await expect(insert({ token: "abc" })).rejects.toThrow(/must not contain credentials/);
    await expect(insert({ nested: { deeper: { password: "hunter2" } } })).rejects.toThrow(/must not contain credentials/);
    await expect(insert({ list: [{ secret: "x" }] })).rejects.toThrow(/must not contain credentials/);
    await expect(insert({ note: generateToken() })).rejects.toThrow(/must not contain credentials/);
    await expect(insert({ authorization: "Bearer abc" })).rejects.toThrow(/must not contain credentials/);
    await insert({ before: { status: "active" }, after: { status: "revoked" }, count: 3, reason: "fine" });
    await insert({ tokenStatus: "revoked", serial: "AXM-00000001" });
  });

  it("tokens are never deleted and cannot be re-activated", async () => {
    const u = await createLiveUnit();
    await expect(admin.query("delete from public.part_tokens where unit_id = $1", [u.unit.id])).rejects.toThrow(/never deleted/);
    await admin.query("select public.revoke_part_token($1, null, 'test revoke')", [u.unit.id]);
    await expect(admin.query("update public.part_tokens set status = 'active', revoked_at = null, revocation_reason = null where unit_id = $1", [u.unit.id])).rejects.toThrow(/re-activated|check constraint/);
    await expect(admin.query("update public.part_tokens set token_hash = $2 where unit_id = $1", [u.unit.id, Buffer.alloc(32, 1)])).rejects.toThrow(/immutable/);
  });
});

describe("retention", () => {
  it("scrubs old network identifiers but keeps the event, and anonymises old support cases", async () => {
    const u = await createLiveUnit();
    await admin.query(
      `insert into public.verification_events (unit_id, result, channel, request_id, network_hash, country, created_at)
       values ($1, 'recognized_repeat', 'customer', $2, $3, 'LK', now() - interval '120 days')`,
      [u.unit.id, randomUUID(), Buffer.alloc(16, 5)],
    );
    const sc = await admin.query(
      `insert into public.support_cases (kind, subject, message, contact_email, status, purge_after, resolved_at)
       values ('question', 'old question', 'a message', 'old@example.test', 'resolved', now() - interval '1 day', now() - interval '30 days') returning id`,
    );
    const out = (await admin.query("select public.purge_expired_data() as r")).rows[0].r;
    expect(out.verificationEventsScrubbed).toBeGreaterThanOrEqual(1);
    expect(out.supportCasesAnonymised).toBeGreaterThanOrEqual(1);
    const ev = (await admin.query("select network_hash, country, result from public.verification_events where unit_id = $1 and created_at < now() - interval '100 days'", [u.unit.id])).rows[0];
    expect(ev).toEqual({ network_hash: null, country: null, result: "recognized_repeat" });
    const row = (await admin.query("select contact_email, message, purged_at from public.support_cases where id = $1", [sc.rows[0].id])).rows[0];
    expect(row.contact_email).toBeNull();
    expect(row.purged_at).not.toBeNull();
    // the purge flag does not leave a back door open
    const e2 = (await admin.query("select id from public.verification_events where unit_id = $1 limit 1", [u.unit.id])).rows[0];
    await expect(admin.query("update public.verification_events set country = 'XX' where id = $1", [e2.id])).rejects.toThrow(/append-only/);
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within the window and reports remaining", async () => {
    const key = `rl:${randomUUID()}`;
    const seq = [];
    for (let i = 0; i < 5; i++) seq.push((await admin.query("select * from public.rate_limit_hit($1, 60, 3)", [key])).rows[0]);
    expect(seq.map((s) => s.allowed)).toEqual([true, true, true, false, false]);
    expect(seq.map((s) => s.remaining)).toEqual([2, 1, 0, 0, 0]);
    expect(seq[0].reset_at.getTime()).toBeGreaterThan(Date.now() - 1000);
    // independent keys do not interfere
    expect((await admin.query("select * from public.rate_limit_hit($1, 60, 3)", [`rl:${randomUUID()}`])).rows[0].allowed).toBe(true);
  });
});

describe("release helper sanity", () => {
  it("createLiveUnit yields a verifiable unit", async () => {
    const u = await createLiveUnit();
    expect((await admin.query("select lifecycle_status, label_status from public.part_units where id = $1", [u.unit.id])).rows[0]).toEqual({ lifecycle_status: "released", label_status: "applied" });
    expect(await createUser()).toBeTruthy();
    expect(releaseUnit).toBeTypeOf("function");
  });
});
