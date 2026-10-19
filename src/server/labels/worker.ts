import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { appPool, withTransaction } from "@/server/db/pool";
import { log } from "@/server/logger";
import { generateManualCode, generateToken, hashManualCode, hashToken } from "@/server/security/tokens";
import { renderLabelPdf, type LabelItem } from "@/server/labels/pdf";
import { labelSpecSchema } from "@/server/labels/spec";
import type { ObjectStore } from "@/server/storage";

export type WorkerContext = { company: string; siteUrl: string; artifactDays: number; store: ObjectStore };

export type ChunkResult =
  | { status: "progress"; jobId: string; unitsDone: number; requested: number; partNo: number }
  | { status: "completed" | "cancelled" | "failed"; jobId: string; unitsDone: number; requested: number; error?: string }
  | { status: "busy"; jobId: string }
  | { status: "not_found"; jobId: string };

type JobRow = {
  id: string; batch_id: string; kind: "issue" | "reissue"; state: string; requested_quantity: number; units_done: number;
  next_part_no: number; chunk_size: number; label_spec: unknown; cancel_requested: boolean; created_by: string | null; reason: string | null;
};
type UnitRow = { unit_id: string; serial_number: string; name: string; part_number: string };

export const artifactPath = (jobId: string, partNo: number) => `jobs/${jobId}/part-${String(partNo).padStart(3, "0")}.pdf`;

/**
 * Processes ONE chunk of a label job inside a single database transaction:
 * lock job -> pick next units -> generate credentials -> store hashes -> render PDF ->
 * upload to private storage -> record artifact -> commit.
 *
 * If anything fails, the transaction rolls back, so no token can exist without a PDF that
 * contains it (an orphaned upload is harmless: it is overwritten by the retry).
 * Safe to call concurrently: the job row is locked with SKIP LOCKED.
 */
export async function processNextChunk(jobId: string, ctx: WorkerContext): Promise<ChunkResult> {
  try {
    return await withTransaction((c) => runChunk(c, jobId, ctx));
  } catch (err) {
    const summary = safeSummary(err);
    log.error("labels.chunk_failed", { jobId, code: (err as { code?: string }).code, message: (err as Error).message });
    const { rows } = await appPool().query<{ units_done: number; requested_quantity: number }>(
      `update public.label_jobs set state = 'failed', error_summary = $2, finished_at = now()
       where id = $1 and state in ('queued', 'running') returning units_done, requested_quantity`,
      [jobId, summary],
    );
    const r = rows[0];
    return { status: "failed", jobId, unitsDone: r?.units_done ?? 0, requested: r?.requested_quantity ?? 0, error: summary };
  }
}

async function runChunk(c: PoolClient, jobId: string, ctx: WorkerContext): Promise<ChunkResult> {
  const locked = await c.query<JobRow>("select * from public.label_jobs where id = $1 for update skip locked", [jobId]);
  const job = locked.rows[0];
  if (!job) {
    const exists = await c.query("select 1 from public.label_jobs where id = $1", [jobId]);
    return exists.rowCount ? { status: "busy", jobId } : { status: "not_found", jobId };
  }
  const done = (status: "completed" | "cancelled" | "failed", extra: { error?: string } = {}): ChunkResult => ({ status, jobId, unitsDone: job.units_done, requested: job.requested_quantity, ...extra });

  if (job.state === "completed" || job.state === "cancelled") return done(job.state);
  if (job.state === "failed") return done("failed", { error: "This job failed. Retry it from the job page." });

  if (job.cancel_requested) {
    await c.query("update public.label_jobs set state = 'cancelled', finished_at = now() where id = $1", [jobId]);
    return done("cancelled");
  }
  if (job.state === "queued") {
    await c.query("update public.label_jobs set state = 'running', started_at = coalesce(started_at, now()), attempts = attempts + 1 where id = $1", [jobId]);
  }

  const { rows: units } = await c.query<UnitRow>(
    `select ju.unit_id, u.serial_number, p.name, p.part_number
     from public.label_job_units ju
     join public.part_units u on u.id = ju.unit_id
     join public.products p on p.id = u.product_id
     where ju.job_id = $1 and ju.processed_at is null
     order by ju.position limit $2 for update of ju skip locked`,
    [jobId, job.chunk_size],
  );

  if (units.length === 0) {
    await c.query("update public.label_jobs set state = 'completed', finished_at = now() where id = $1", [jobId]);
    return { status: "completed", jobId, unitsDone: job.units_done, requested: job.requested_quantity };
  }

  const spec = labelSpecSchema.parse(job.label_spec);
  const creds = units.map((u) => ({ ...u, token: generateToken(), code: generateManualCode() }));

  if (job.kind === "issue") {
    await c.query("select public.issue_part_tokens($1, $2::uuid[], $3::bytea[], $4::bytea[], $5)", [
      jobId, creds.map((x) => x.unit_id), creds.map((x) => hashToken(x.token)), creds.map((x) => hashManualCode(x.code)), job.created_by,
    ]);
  } else {
    for (const x of creds) {
      await c.query("select public.replace_part_token($1, $2, $3, $4, $5, $6)", [x.unit_id, hashToken(x.token), hashManualCode(x.code), job.created_by, job.reason ?? "label reissue", jobId]);
    }
  }

  const partNo = job.next_part_no;
  const items: LabelItem[] = creds.map((x) => ({ serial: x.serial_number, token: x.token, code: x.code, productName: x.name, partNumber: x.part_number }));
  const pdf = await renderLabelPdf({ spec, items, siteUrl: ctx.siteUrl, company: ctx.company, title: `Labels ${items[0]!.serial} – ${items.at(-1)!.serial}` });
  const path = artifactPath(jobId, partNo);
  await ctx.store.put(path, pdf, "application/pdf");

  await c.query(
    `update public.label_job_units ju set processed_at = now(), part_no = $3,
       token_id = (select t.id from public.part_tokens t where t.unit_id = ju.unit_id and t.status = 'active')
     where ju.job_id = $1 and ju.unit_id = any($2::uuid[])`,
    [jobId, creds.map((x) => x.unit_id), partNo],
  );
  await c.query(
    `insert into public.label_job_artifacts (job_id, part_no, storage_path, units_count, first_serial, last_serial, bytes, sha256, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9))
     on conflict (job_id, part_no) do update set storage_path = excluded.storage_path, units_count = excluded.units_count,
       first_serial = excluded.first_serial, last_serial = excluded.last_serial, bytes = excluded.bytes, sha256 = excluded.sha256,
       expires_at = excluded.expires_at, deleted_at = null`,
    [jobId, partNo, path, creds.length, creds[0]!.serial_number, creds.at(-1)!.serial_number, pdf.length, createHash("sha256").update(pdf).digest("hex"), ctx.artifactDays],
  );

  const unitsDone = job.units_done + creds.length;
  const finished = unitsDone >= job.requested_quantity;
  await c.query(
    `update public.label_jobs set units_done = $2, next_part_no = $3, error_summary = null,
       artifact_prefix = $4, artifact_expires_at = now() + make_interval(days => $5),
       state = case when $6 then 'completed' else 'running' end, finished_at = case when $6 then now() else null end
     where id = $1`,
    [jobId, unitsDone, partNo + 1, `jobs/${jobId}/`, ctx.artifactDays, finished],
  );
  return finished
    ? { status: "completed", jobId, unitsDone, requested: job.requested_quantity }
    : { status: "progress", jobId, unitsDone, requested: job.requested_quantity, partNo };
}

/** Never put internals, SQL or stack traces into the job record that staff see. */
function safeSummary(err: unknown): string {
  const code = (err as { code?: string }).code;
  const msg = (err as Error)?.message ?? "";
  if (/storage/i.test(msg)) return "The PDF could not be saved to private storage. No credentials were issued for this chunk. Retry the job.";
  if (code === "P0001") return "A unit changed state while the job was running (for example it was retired or already labelled). Review the batch and retry.";
  if (code && (code.startsWith("08") || code.startsWith("57"))) return "The database was unreachable. Nothing was issued for this chunk. Retry the job.";
  if (/does not fit/.test(msg)) return "The label layout does not fit on the page. Adjust the label size and create a new job.";
  return "Unexpected error. Nothing was issued for this chunk. Retry, and contact an administrator if it keeps failing.";
}

/** Deletes expired private artifacts from storage and marks them; the credentials in them can no longer be re-downloaded. */
export async function purgeExpiredArtifacts(store: ObjectStore, limit = 200): Promise<number> {
  const { rows } = await appPool().query<{ id: string; storage_path: string }>(
    "select id, storage_path from public.label_job_artifacts where deleted_at is null and expires_at < now() order by expires_at limit $1",
    [limit],
  );
  if (!rows.length) return 0;
  await store.remove(rows.map((r) => r.storage_path));
  await appPool().query("update public.label_job_artifacts set deleted_at = now() where id = any($1::uuid[])", [rows.map((r) => r.id)]);
  return rows.length;
}
