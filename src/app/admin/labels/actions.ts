"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { appPool, withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { mapDbError, validationFailure } from "@/server/action-utils";
import { LIMITS, hit } from "@/server/ratelimit";
import { defaultWorkerContext } from "@/server/labels/context";
import { checkSpec } from "@/server/labels/spec";
import { processNextChunk } from "@/server/labels/worker";
import { createJobSchema } from "@/lib/schemas/labels";
import { buildVerificationUrl, generateToken, hashParsedCredential, parseCredential } from "@/server/security/tokens";
import { qrMatrix } from "@/server/qr";
import { siteUrl } from "@/server/settings";

const refresh = (jobId?: string) => { revalidatePath("/admin/labels"); revalidatePath("/admin/dashboard"); if (jobId) revalidatePath(`/admin/label-jobs/${jobId}`); };

export async function createLabelJob(input: unknown): Promise<ActionResult<{ jobId: string; allocated: number }>> {
  return authorized("labels.generate", async (staff) => {
    const parsed = createJobSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;

    const rl = await hit(`labeljob:${staff.userId}`, LIMITS.labelJobs.window, LIMITS.labelJobs.limit);
    if (!rl.allowed) return { ok: false, code: "conflict", error: "You've started many label jobs recently. Please wait a little before starting another." };

    const modules = qrMatrix(buildVerificationUrl(siteUrl(), generateToken()), v.spec.qrErrorCorrection).size;
    const check = checkSpec(v.spec, modules);
    if (!check.ok) return { ok: false, code: "validation", error: check.errors[0]!, fieldErrors: { spec: check.errors.join(" ") } };

    try {
      const out = await withTransaction(async (c) => {
        const r = (await c.query<{ r: { jobId: string; created: boolean; allocated: number } }>("select public.create_label_job($1, 'issue', $2, $3, $4, $5, null, 500, null) as r", [v.batchId, v.quantity, v.idempotencyKey, JSON.stringify(v.spec), staff.userId])).rows[0]!.r;
        if (r.created) await writeAudit(staff, { action: "label_job.create", targetType: "label_job", targetId: r.jobId, metadata: { batchId: v.batchId, requested: v.quantity, allocated: r.allocated, labelsPerPage: check.layout.perPage } }, c);
        return r;
      });
      refresh(out.jobId);
      return { ok: true, data: { jobId: out.jobId, allocated: out.allocated } };
    } catch (err) {
      // A concurrent request with the same key loses the unique race: hand back the winner's job.
      if ((err as { code?: string }).code === "23505") {
        const r = await appPool().query<{ id: string; requested_quantity: number }>("select id, requested_quantity from public.label_jobs where idempotency_key = $1", [v.idempotencyKey]);
        if (r.rows[0]) return { ok: true, data: { jobId: r.rows[0].id, allocated: r.rows[0].requested_quantity } };
      }
      return mapDbError(err);
    }
  });
}

export type AdvanceResult = { status: "progress" | "completed" | "cancelled" | "failed" | "busy" | "not_found"; unitsDone: number; requested: number; error?: string };

/** Processes one chunk (a few hundred labels). The browser calls this repeatedly; the cron route does the same for abandoned jobs. */
export async function advanceLabelJob(jobId: string): Promise<ActionResult<AdvanceResult>> {
  return authorized("labels.generate", async (staff) => {
    const before = (await appPool().query<{ state: string }>("select state from public.label_jobs where id = $1", [jobId])).rows[0]?.state;
    const r = await processNextChunk(jobId, await defaultWorkerContext());
    if (before && ["queued", "running"].includes(before) && ["completed", "cancelled", "failed"].includes(r.status)) {
      await writeAudit(staff, { action: `label_job.${r.status}`, targetType: "label_job", targetId: jobId, metadata: { unitsDone: "unitsDone" in r ? r.unitsDone : 0 } }).catch(() => {});
      refresh(jobId);
    }
    return { ok: true, data: { status: r.status, unitsDone: "unitsDone" in r ? r.unitsDone : 0, requested: "requested" in r ? r.requested : 0, error: "error" in r ? r.error : undefined } };
  });
}

export async function cancelLabelJob(jobId: string): Promise<ActionResult> {
  return authorized("labels.generate", async (staff) => {
    try {
      await withTransaction(async (c) => {
        const r = await c.query("update public.label_jobs set cancel_requested = true, state = case when state = 'queued' and units_done = 0 then 'cancelled' else state end, finished_at = case when state = 'queued' and units_done = 0 then now() else finished_at end where id = $1 and state in ('queued', 'running') returning id", [jobId]);
        if (!r.rowCount) throw Object.assign(new Error("This job has already finished."), { code: "P0001" });
        await writeAudit(staff, { action: "label_job.cancel_requested", targetType: "label_job", targetId: jobId }, c);
      });
      refresh(jobId);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

export async function retryLabelJob(jobId: string): Promise<ActionResult> {
  return authorized("labels.generate", async (staff) => {
    try {
      await withTransaction(async (c) => {
        const r = await c.query("update public.label_jobs set state = 'queued', error_summary = null, finished_at = null, cancel_requested = false where id = $1 and state = 'failed' returning id", [jobId]);
        if (!r.rowCount) throw Object.assign(new Error("Only a failed job can be retried."), { code: "P0001" });
        await writeAudit(staff, { action: "label_job.retry", targetType: "label_job", targetId: jobId }, c);
      });
      refresh(jobId);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

/** A person confirms what physically happened. Nothing else in the system may set these states. */
export async function confirmLabels(jobId: string, partNo: number | null, to: "printed" | "applied"): Promise<ActionResult<{ changed: number }>> {
  return authorized("labels.confirm", async (staff) => {
    if (!["printed", "applied"].includes(to) || (partNo !== null && !Number.isInteger(partNo))) return { ok: false, code: "validation", error: "Invalid request." };
    try {
      const changed = await withTransaction(async (c) => {
        const ids = (await c.query<{ unit_id: string }>("select unit_id from public.label_job_units where job_id = $1 and processed_at is not null and ($2::int is null or part_no = $2)", [jobId, partNo])).rows.map((r) => r.unit_id);
        if (ids.length === 0) return 0;
        // Confirming "applied" implies the sheet was printed.
        if (to === "applied") await c.query("select public.set_label_status($1::uuid[], 'printed', $2, $3)", [ids, staff.userId, "implied by applied confirmation"]);
        const n = (await c.query<{ n: number }>("select public.set_label_status($1::uuid[], $2, $3, $4) as n", [ids, to, staff.userId, partNo ? `part ${partNo}` : "whole job"])).rows[0]!.n;
        await writeAudit(staff, { action: `labels.confirm_${to}`, targetType: "label_job", targetId: jobId, metadata: { part: partNo, units: ids.length, changed: n } }, c);
        return n;
      });
      refresh(jobId);
      return { ok: true, data: { changed } };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

export type QcResult = { result: string; serial?: string; product?: string; partNumber?: string; lifecycle?: string; counted: false };

/**
 * Internal quality-control check of a printed label. Recorded on the 'qc' channel, so it never
 * counts as a customer verification, never opens investigations, and never marks a first scan.
 */
export async function qcCheck(input: unknown): Promise<ActionResult<QcResult>> {
  return authorized<QcResult>("qc.verify", async (staff) => {
    const cred = parseCredential(typeof (input as { credential?: unknown })?.credential === "string" ? (input as { credential: string }).credential : null);
    if (!cred) return { ok: false, code: "validation", error: "That isn't a valid code or label URL.", fieldErrors: { credential: "Paste the label's web address or its 20-character backup code." } };
    const rl = await hit(`qc:${staff.userId}`, 60, 120);
    if (!rl.allowed) return { ok: false, code: "conflict", error: "Too many checks in a minute. Wait a moment." };
    const { rows } = await appPool().query<{ r: { result: string; unit?: { serial: string; lifecycle: string }; product?: { name: string; partNumber: string } } }>(
      "select public.verify_part_token($1, $2, 'qc', $3, null, null, null, $4) as r", [hashParsedCredential(cred), cred.kind, randomUUID(), staff.userId]);
    const r = rows[0]!.r;
    return { ok: true, data: { result: r.result, serial: r.unit?.serial, product: r.product?.name, partNumber: r.product?.partNumber, lifecycle: r.unit?.lifecycle, counted: false } };
  });
}
