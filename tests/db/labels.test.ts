import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { generateManualCode, generateToken, hashManualCode, hashToken } from "@/server/security/tokens";
import { admin, closePools, createBatch, createProduct, issueToken, registerUnits } from "./support/fixtures";

afterAll(closePools);

const spec = { page: "A4", labelWidthMm: 50, labelHeightMm: 30, qrSizeMm: 22 };
const createJob = async (batchId: string, qty: number, key = randomUUID(), kind = "issue", unitIds: string[] | null = null) =>
  (await admin.query("select public.create_label_job($1, $2, $3, $4, $5, null, $6::uuid[], 500, $7) as r", [batchId, kind, qty, key, JSON.stringify(spec), unitIds, kind === "reissue" ? "test reissue" : null])).rows[0].r as { jobId: string; created: boolean; allocated: number };

async function batchWithUnits(n: number) {
  const p = await createProduct();
  const b = await createBatch(p.id, n);
  const units = await registerUnits(b.id, n);
  return { p, b, units };
}

describe("create_label_job", () => {
  it("allocates only unlabelled units, in serial order, limited by the requested quantity", async () => {
    const { b, units } = await batchWithUnits(10);
    await issueToken(units[0]!.id);
    const job = await createJob(b.id, 6);
    expect(job).toMatchObject({ created: true, allocated: 6 });
    const alloc = (await admin.query("select u.serial_number from public.label_job_units ju join public.part_units u on u.id = ju.unit_id where ju.job_id = $1 order by ju.position", [job.jobId])).rows.map((r) => r.serial_number);
    expect(alloc).toEqual(units.slice(1, 7).map((u) => u.serial_number));
  });

  it("is idempotent for the same key, even when retried", async () => {
    const { b } = await batchWithUnits(5);
    const key = randomUUID();
    const first = await createJob(b.id, 5, key);
    const second = await createJob(b.id, 5, key);
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, jobId: first.jobId });
    expect((await admin.query("select count(*)::int c from public.label_jobs where idempotency_key = $1", [key])).rows[0].c).toBe(1);
  });

  it("two concurrent requests with the same key create one job", async () => {
    const { b } = await batchWithUnits(5);
    const key = randomUUID();
    const settled = await Promise.allSettled([createJob(b.id, 5, key), createJob(b.id, 5, key), createJob(b.id, 5, key)]);
    const ok = settled.filter((s) => s.status === "fulfilled");
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect((await admin.query("select count(*)::int c from public.label_jobs where idempotency_key = $1", [key])).rows[0].c).toBe(1);
    for (const s of settled) if (s.status === "rejected") expect(String(s.reason)).toMatch(/idempotency|duplicate key/);
  });

  it("does not double-allocate units that belong to another unfinished job", async () => {
    const { b } = await batchWithUnits(10);
    const first = await createJob(b.id, 6);
    const second = await createJob(b.id, 10);
    expect(first.allocated).toBe(6);
    expect(second.allocated).toBe(4);
    await expect(createJob(b.id, 10)).rejects.toThrow(/no eligible units/);
    // once the first job is finished its units are free again (if still without tokens)
    await admin.query("update public.label_jobs set state = 'cancelled' where id = $1", [first.jobId]);
    expect((await createJob(b.id, 10)).allocated).toBe(6);
  });

  it("refuses quarantined or on-hold batches and empty reissue requests", async () => {
    const { b, units } = await batchWithUnits(3);
    await expect(createJob(b.id, 3, randomUUID(), "reissue")).rejects.toThrow(/explicit units/);
    await admin.query("select public.set_batch_qc_hold($1, true)", [b.id]);
    await expect(createJob(b.id, 3)).rejects.toThrow(/cannot be labelled/);
    await admin.query("select public.set_batch_qc_hold($1, false)", [b.id]);
    await issueToken(units[0]!.id);
    const re = await createJob(b.id, 1, randomUUID(), "reissue", [units[0]!.id]);
    expect(re.allocated).toBe(1);
  });
});

describe("issue_part_tokens (bulk)", () => {
  it("issues one token per unit atomically and moves label status to issued", async () => {
    const { b, units } = await batchWithUnits(50);
    const job = await createJob(b.id, 50);
    const ids = units.map((u) => u.id);
    const tokens = ids.map(() => generateToken());
    const codes = ids.map(() => generateManualCode());
    const n = (await admin.query("select public.issue_part_tokens($1, $2::uuid[], $3::bytea[], $4::bytea[], null) as n", [job.jobId, ids, tokens.map(hashToken), codes.map(hashManualCode)])).rows[0].n;
    expect(n).toBe(50);
    const { rows } = await admin.query("select label_status, count(*)::int c from public.part_units where batch_id = $1 group by 1", [b.id]);
    expect(rows).toEqual([{ label_status: "issued", c: 50 }]);
    const ev = (await admin.query("select count(*)::int c from public.label_events where job_id = $1 and event_type = 'issued'", [job.jobId])).rows[0].c;
    expect(ev).toBe(50);
  });

  it("rolls back the whole chunk if one unit already has an active token", async () => {
    const { units } = await batchWithUnits(4);
    await issueToken(units[2]!.id);
    const ids = units.map((u) => u.id);
    await expect(
      admin.query("select public.issue_part_tokens(null, $1::uuid[], $2::bytea[], $3::bytea[], null)", [ids, ids.map(() => hashToken(generateToken())), ids.map(() => hashManualCode(generateManualCode()))]),
    ).rejects.toThrow(/already have an active token/);
    const { rows } = await admin.query("select count(*)::int c from public.part_tokens where unit_id = any($1::uuid[])", [ids]);
    expect(rows[0].c).toBe(1); // only the pre-existing one
  });

  it("rejects mismatched array lengths", async () => {
    const { units } = await batchWithUnits(2);
    await expect(
      admin.query("select public.issue_part_tokens(null, $1::uuid[], $2::bytea[], $3::bytea[], null)", [[units[0]!.id, units[1]!.id], [hashToken(generateToken())], [hashManualCode(generateManualCode())]]),
    ).rejects.toThrow(/same non-zero length/);
  });
});

describe("replacement and revocation bookkeeping", () => {
  it("links old and new tokens, records label events, and requires a reason", async () => {
    const { units } = await batchWithUnits(1);
    const first = await issueToken(units[0]!.id);
    await expect(admin.query("select public.replace_part_token($1, $2, $3, null, '')", [units[0]!.id, hashToken(generateToken()), hashManualCode(generateManualCode())])).rejects.toThrow(/reason is required/);
    const newId = (await admin.query("select public.replace_part_token($1, $2, $3, null, 'label torn') as id", [units[0]!.id, hashToken(generateToken()), hashManualCode(generateManualCode())])).rows[0].id;
    const old = (await admin.query("select status, replaced_by_token_id, revocation_reason from public.part_tokens where id = $1", [first.tokenId])).rows[0];
    expect(old).toEqual({ status: "replaced", replaced_by_token_id: newId, revocation_reason: "label torn" });
    const ev = (await admin.query("select event_type from public.label_events where unit_id = $1 order by id", [units[0]!.id])).rows.map((r) => r.event_type);
    expect(ev).toEqual(["issued", "reissued"]);
  });

  it("revoke is a no-op returning null when there is no active token", async () => {
    const { units } = await batchWithUnits(1);
    expect((await admin.query("select public.revoke_part_token($1, null, 'nothing to revoke') as id", [units[0]!.id])).rows[0].id).toBeNull();
  });
});
