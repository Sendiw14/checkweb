import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "@/server/security/tokens";
import { labelSpecSchema } from "@/server/labels/spec";
import { createLocalStore, type ObjectStore } from "@/server/storage";
import { artifactPath, processNextChunk, purgeExpiredArtifacts, type WorkerContext } from "@/server/labels/worker";
import { decodeSheet, tokenFromUrl } from "../support/pdf-decode";
import { admin, appServer, closePools, createBatch, createProduct, releaseUnit, verify } from "./support/fixtures";
import { TEST_DB } from "./support/urls";

const base = `127.0.0.1:${process.env.TEST_PG_PORT ?? "5432"}/${TEST_DB}`;
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: `postgres://app_server:app_server_pw@${base}`, VERIFIER_DATABASE_URL: `postgres://app_verifier:app_verifier_pw@${base}`,
  SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40),
  PUBLIC_SITE_URL: "https://verify.example.com", NETWORK_HASH_PEPPER: "test-pepper-".padEnd(40, "x"), ARTIFACT_STORAGE: "local",
});

const spec = labelSpecSchema.parse({});
let root: string;
let store: ObjectStore;
let ctx: WorkerContext;
let closeAppPools: () => Promise<void>;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "label-store-"));
  store = createLocalStore(root);
  ctx = { company: "Axiom Motive", siteUrl: "https://verify.example.com", artifactDays: 14, store };
  ({ closePools: closeAppPools } = await import("@/server/db/pool"));
});
afterAll(async () => {
  rmSync(root, { recursive: true, force: true });
  await closeAppPools();
  await closePools();
});

async function newJob(units: number, opts: { kind?: "issue" | "reissue"; unitIds?: string[]; batchId?: string; chunk?: number } = {}) {
  let batchId = opts.batchId;
  if (!batchId) {
    const b = await createBatch((await createProduct()).id, units);
    batchId = b.id;
    await admin.query("select public.register_batch_units($1, $2)", [batchId, units]);
  }
  const r = (await admin.query("select public.create_label_job($1, $2, $3, $4, $5, null, $6::uuid[], $7, $8) as r", [batchId, opts.kind ?? "issue", units, randomUUID(), JSON.stringify(spec), opts.unitIds ?? null, opts.chunk ?? 500, opts.kind === "reissue" ? "label damaged" : null])).rows[0].r as { jobId: string; allocated: number };
  return { batchId, ...r };
}

async function runToEnd(jobId: string, c: WorkerContext = ctx) {
  const results = [];
  for (let i = 0; i < 50; i++) {
    const r = await processNextChunk(jobId, c);
    results.push(r);
    if (r.status !== "progress") break;
  }
  return results;
}

const failingStore = (failOnCall: number): ObjectStore => {
  let n = 0;
  return { ...store, put: async (p, b, t) => { if (++n === failOnCall) throw new Error("storage upload failed: simulated outage"); return store.put(p, b, t); }, get: (p) => store.get(p), remove: (p) => store.remove(p), signedUrl: () => store.signedUrl("x", 1) };
};

describe("label job worker (real database, real PDFs)", () => {
  it("issues 1,200 units in 3 chunks, stores private PDFs, and the QR codes in them verify against the database", async () => {
    const job = await newJob(1200);
    expect(job.allocated).toBe(1200);
    const results = await runToEnd(job.jobId);
    expect(results.map((r) => r.status)).toEqual(["progress", "progress", "completed"]);
    expect(results.at(-1)).toMatchObject({ unitsDone: 1200, requested: 1200 });

    const jobRow = (await admin.query("select state, units_done, next_part_no, artifact_prefix, artifact_expires_at, error_summary from public.label_jobs where id = $1", [job.jobId])).rows[0];
    expect(jobRow).toMatchObject({ state: "completed", units_done: 1200, next_part_no: 4, artifact_prefix: `jobs/${job.jobId}/`, error_summary: null });
    expect(new Date(jobRow.artifact_expires_at).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);

    const arts = (await admin.query("select * from public.label_job_artifacts where job_id = $1 order by part_no", [job.jobId])).rows;
    expect(arts.map((a) => a.units_count)).toEqual([500, 500, 200]);
    for (const a of arts) {
      const bytes = await store.get(a.storage_path);
      expect(bytes, a.storage_path).not.toBeNull();
      expect(createHash("sha256").update(bytes!).digest("hex")).toBe(a.sha256);
      expect(a.storage_path).toBe(artifactPath(job.jobId, a.part_no));
    }

    // every unit now has exactly one active token and an 'issued' label
    const stats = (await admin.query(
      `select count(*)::int units, count(*) filter (where u.label_status = 'issued')::int issued,
              count(t.id) filter (where t.status = 'active')::int active, count(distinct t.unit_id)::int with_token
       from public.part_units u left join public.part_tokens t on t.unit_id = u.id where u.batch_id = $1`, [job.batchId])).rows[0];
    expect(stats).toEqual({ units: 1200, issued: 1200, active: 1200, with_token: 1200 });

    // PROOF: decode the first sheet of the first artifact; each QR must resolve, via the real
    // verification function, to the serial number that is printed in the same order.
    const first = (await admin.query("select serial_number from public.part_units where batch_id = $1 order by serial_number limit 24", [job.batchId])).rows.map((r) => r.serial_number);
    const decoded = decodeSheet(await store.get(arts[0].storage_path) as Buffer, spec, { page: 1 });
    expect(decoded.every(Boolean)).toBe(true);
    const tokens: string[] = [];
    for (let i = 0; i < 24; i++) {
      const token = tokenFromUrl(decoded[i]!);
      tokens.push(token);
      const r = await verify({ hash: hashToken(token), channel: "qc" });
      expect(r.result).toBe("not_released"); // issued, labelled, but not yet released
      expect(r.unit.serial).toBe(first[i]);
    }

    // The plaintext tokens exist only inside the PDFs: nowhere in the database.
    for (const table of ["part_tokens", "label_jobs", "label_job_units", "label_job_artifacts", "label_events", "verification_events", "audit_logs"]) {
      const dump = JSON.stringify((await admin.query(`select * from public.${table}`)).rows);
      for (const t of tokens) expect(dump.includes(t), `${table} leaked a token`).toBe(false);
    }
  }, 120_000);

  it("rolls the whole chunk back when storage fails, reports a safe error, and a retry resumes without duplicates", async () => {
    const job = await newJob(1000);
    const flaky = { ...ctx, store: failingStore(2) }; // first chunk uploads, second fails
    const r1 = await processNextChunk(job.jobId, flaky);
    expect(r1.status).toBe("progress");
    const r2 = await processNextChunk(job.jobId, flaky);
    expect(r2).toMatchObject({ status: "failed", unitsDone: 500 });
    expect((r2 as { error: string }).error).toMatch(/private storage/);
    expect((r2 as { error: string }).error).not.toMatch(/simulated|at |node_modules/);

    const mid = (await admin.query(`select count(*)::int c from public.part_tokens t join public.part_units u on u.id = t.unit_id where u.batch_id = $1`, [job.batchId])).rows[0].c;
    expect(mid).toBe(500); // the failed chunk issued NOTHING
    expect((await admin.query("select state, error_summary, units_done from public.label_jobs where id = $1", [job.jobId])).rows[0]).toMatchObject({ state: "failed", units_done: 500 });
    expect((await processNextChunk(job.jobId, ctx)).status).toBe("failed"); // failed jobs don't silently restart

    await admin.query("update public.label_jobs set state = 'queued', error_summary = null, finished_at = null where id = $1", [job.jobId]); // what the Retry action does
    const rest = await runToEnd(job.jobId);
    expect(rest.at(-1)).toMatchObject({ status: "completed", unitsDone: 1000 });
    const dupes = (await admin.query(`select count(*)::int c from (select unit_id from public.part_tokens t join public.part_units u on u.id = t.unit_id where u.batch_id = $1 and t.status = 'active' group by unit_id having count(*) > 1) x`, [job.batchId])).rows[0].c;
    expect(dupes).toBe(0);
    expect((await admin.query(`select count(*)::int c from public.part_tokens t join public.part_units u on u.id = t.unit_id where u.batch_id = $1`, [job.batchId])).rows[0].c).toBe(1000);
  }, 120_000);

  it("is safe under concurrency: two workers never double-issue", async () => {
    const job = await newJob(600);
    const results = await Promise.all([processNextChunk(job.jobId, ctx), processNextChunk(job.jobId, ctx), processNextChunk(job.jobId, ctx)]);
    expect(results.filter((r) => r.status === "busy").length).toBeGreaterThanOrEqual(1);
    await runToEnd(job.jobId);
    const { rows } = await admin.query(`select count(*)::int tokens, count(distinct unit_id)::int units from public.part_tokens t join public.part_units u on u.id = t.unit_id where u.batch_id = $1`, [job.batchId]);
    expect(rows[0]).toEqual({ tokens: 600, units: 600 });
  }, 120_000);

  it("cancellation stops after the current chunk, keeps what was issued, and frees the rest for a new job", async () => {
    const job = await newJob(700);
    expect((await processNextChunk(job.jobId, ctx)).status).toBe("progress");
    await admin.query("update public.label_jobs set cancel_requested = true where id = $1", [job.jobId]);
    expect(await processNextChunk(job.jobId, ctx)).toMatchObject({ status: "cancelled", unitsDone: 500 });
    expect((await admin.query("select state from public.label_jobs where id = $1", [job.jobId])).rows[0].state).toBe("cancelled");
    const again = await newJob(700, { batchId: job.batchId });
    expect(again.allocated).toBe(200); // only the units that never got a label
  }, 120_000);

  it("a reissue job replaces credentials: new label decodes, old token is revoked", async () => {
    const issue = await newJob(3);
    await runToEnd(issue.jobId);
    const units = (await admin.query("select id, serial_number from public.part_units where batch_id = $1 order by serial_number", [issue.batchId])).rows;
    const oldDecoded = decodeSheet(await store.get(artifactPath(issue.jobId, 1)) as Buffer, spec, { count: 3 });
    const oldTokens = oldDecoded.map((d) => tokenFromUrl(d!));
    for (const u of units) await releaseUnit(u.id);

    const re = await newJob(1, { kind: "reissue", unitIds: [units[1].id], batchId: issue.batchId });
    await runToEnd(re.jobId);
    const newDecoded = decodeSheet(await store.get(artifactPath(re.jobId, 1)) as Buffer, spec, { count: 1 });
    const newToken = tokenFromUrl(newDecoded[0]!);
    expect(newToken).not.toBe(oldTokens[1]);

    expect((await verify({ hash: hashToken(oldTokens[1]!), channel: "qc" })).result).toBe("revoked");
    const fresh = await verify({ hash: hashToken(newToken), channel: "qc" });
    expect(fresh.result).toMatch(/recognized/);
    expect(fresh.unit.serial).toBe(units[1].serial_number);
    expect((await verify({ hash: hashToken(oldTokens[0]!), channel: "qc" })).result).toMatch(/recognized/); // others untouched
    expect((await admin.query("select label_status from public.part_units where id = $1", [units[1].id])).rows[0].label_status).toBe("issued"); // must be re-applied
    expect((await admin.query("select count(*)::int c from public.part_tokens where unit_id = $1 and status = 'active'", [units[1].id])).rows[0].c).toBe(1);
  }, 120_000);

  it("expired artifacts are deleted from storage and can no longer be downloaded", async () => {
    const job = await newJob(10);
    await runToEnd(job.jobId);
    const path = artifactPath(job.jobId, 1);
    expect(await store.get(path)).not.toBeNull();
    await admin.query("update public.label_job_artifacts set expires_at = now() - interval '1 minute' where job_id = $1", [job.jobId]);
    expect(await purgeExpiredArtifacts(store)).toBeGreaterThanOrEqual(1);
    expect(await store.get(path)).toBeNull();
    expect((await admin.query("select deleted_at from public.label_job_artifacts where job_id = $1", [job.jobId])).rows[0].deleted_at).not.toBeNull();
    expect(existsSync(join(root, path))).toBe(false);
  });

  it("the app role really cannot read token hashes even while the worker runs", async () => {
    await expect(appServer.query("select token_hash from public.part_tokens limit 1")).rejects.toThrow(/permission denied/);
  });
});
