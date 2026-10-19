"use server";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { mapDbError, validationFailure } from "@/server/action-utils";
import { batchSchema, quantitySchema, reasonSchema } from "@/lib/schemas/batch";

const UNIQUE = { manufacturing_batches_code_key: { field: "batchCode", message: "Another batch already uses this code." } };
const refresh = (id?: string) => { revalidatePath("/admin/batches"); if (id) revalidatePath(`/admin/batches/${id}`); revalidatePath("/admin/dashboard"); };

export async function createBatch(input: unknown): Promise<ActionResult<{ id: string; registered: number }>> {
  return authorized("batches.write", async (staff) => {
    const parsed = batchSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    try {
      const out = await withTransaction(async (c) => {
        const prod = await c.query("select is_active from public.products where id = $1", [v.productId]);
        if (!prod.rowCount) return { error: "That product no longer exists." };
        if (!prod.rows[0].is_active) return { error: "That product is inactive. Reactivate it before registering a batch." };
        const { rows } = await c.query<{ id: string }>(
          "insert into public.manufacturing_batches (product_id, batch_code, manufacturing_date, expected_quantity, notes, created_by) values ($1, $2, $3, $4, $5, $6) returning id",
          [v.productId, v.batchCode, v.manufacturingDate, v.expectedQuantity, v.notes ?? null, staff.userId]);
        const id = rows[0]!.id;
        let registered = 0;
        if (v.registerNow) registered = (await c.query<{ n: number }>("select public.register_batch_units($1, $2) as n", [id, v.expectedQuantity])).rows[0]!.n;
        await writeAudit(staff, { action: "batch.create", targetType: "batch", targetId: id, metadata: { batchCode: v.batchCode, expectedQuantity: v.expectedQuantity, unitsRegistered: registered } }, c);
        return { id, registered };
      });
      if ("error" in out) return { ok: false, code: "conflict", error: out.error ?? "" };
      refresh();
      return { ok: true, data: out };
    } catch (err) {
      return mapDbError(err, UNIQUE);
    }
  });
}

export async function registerUnits(batchId: string, input: unknown): Promise<ActionResult<{ registered: number }>> {
  return authorized("batches.write", async (staff) => {
    const parsed = quantitySchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    try {
      const n = await withTransaction(async (c) => {
        const r = (await c.query<{ n: number }>("select public.register_batch_units($1, $2) as n", [batchId, parsed.data.quantity])).rows[0]!.n;
        await writeAudit(staff, { action: "batch.register_units", targetType: "batch", targetId: batchId, metadata: { quantity: r } }, c);
        return r;
      });
      refresh(batchId);
      return { ok: true, data: { registered: n } };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

type Transition = { permission: "batches.qc" | "batches.release" | "batches.quarantine"; to: "qc_passed" | "released" | "quarantined" | "restored"; audit: string; needsReason: boolean };
const TRANSITIONS: Record<string, Transition> = {
  qc: { permission: "batches.qc", to: "qc_passed", audit: "batch.qc_pass", needsReason: false },
  release: { permission: "batches.release", to: "released", audit: "batch.release", needsReason: false },
  quarantine: { permission: "batches.quarantine", to: "quarantined", audit: "batch.quarantine", needsReason: true },
  restore: { permission: "batches.quarantine", to: "restored", audit: "batch.restore", needsReason: false },
};

export async function transitionBatch(batchId: string, kind: keyof typeof TRANSITIONS, input?: unknown): Promise<ActionResult<{ requested: number; changed: number; skipped: number }>> {
  const t = TRANSITIONS[kind];
  if (!t) return { ok: false, code: "validation", error: "Unknown action." };
  return authorized(t.permission, async (staff) => {
    let reason: string | null = null;
    if (t.needsReason) {
      const parsed = reasonSchema.safeParse(input);
      if (!parsed.success) return validationFailure(parsed.error);
      reason = parsed.data.reason;
    }
    try {
      const res = await withTransaction(async (c) => {
        const r = (await c.query("select public.transition_units($1, $2, $3, $4, null) as r", [t.to, staff.userId, reason, batchId])).rows[0]!.r as { requested: number; changed: number; skipped: number };
        await writeAudit(staff, { action: t.audit, targetType: "batch", targetId: batchId, metadata: { ...r, ...(reason ? { reason } : {}) } }, c);
        return r;
      });
      refresh(batchId);
      return { ok: true, data: res };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

export async function setQcHold(batchId: string, hold: boolean): Promise<ActionResult> {
  return authorized("batches.qc", async (staff) => {
    try {
      await withTransaction(async (c) => {
        await c.query("select public.set_batch_qc_hold($1, $2)", [batchId, hold]);
        await writeAudit(staff, { action: hold ? "batch.qc_hold" : "batch.qc_hold_lifted", targetType: "batch", targetId: batchId }, c);
      });
      refresh(batchId);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

export async function updateBatchNotes(batchId: string, input: unknown): Promise<ActionResult> {
  return authorized("batches.write", async (staff) => {
    const notes = typeof (input as { notes?: unknown })?.notes === "string" ? (input as { notes: string }).notes.trim().slice(0, 4000) : "";
    try {
      await withTransaction(async (c) => {
        await c.query("update public.manufacturing_batches set notes = $2 where id = $1", [batchId, notes || null]);
        await writeAudit(staff, { action: "batch.update_notes", targetType: "batch", targetId: batchId }, c);
      });
      refresh(batchId);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

export async function setBatchProcessing(batchId: string, status: "in_production" | "completed" | "cancelled"): Promise<ActionResult> {
  return authorized("batches.write", async (staff) => {
    try {
      await withTransaction(async (c) => {
        const cur = (await c.query<{ processing_status: string }>("select processing_status from public.manufacturing_batches where id = $1 for update", [batchId])).rows[0];
        if (!cur) throw Object.assign(new Error("That batch no longer exists."), { code: "P0001" });
        const allowed: Record<string, string[]> = { planned: ["in_production", "cancelled"], in_production: ["completed", "cancelled"], completed: [], cancelled: [] };
        if (!allowed[cur.processing_status]?.includes(status)) throw Object.assign(new Error(`A ${cur.processing_status.replace("_", " ")} batch can't be marked ${status.replace("_", " ")}.`), { code: "P0001" });
        await c.query("update public.manufacturing_batches set processing_status = $2 where id = $1", [batchId, status]);
        await writeAudit(staff, { action: "batch.status", targetType: "batch", targetId: batchId, metadata: { from: cur.processing_status, to: status } }, c);
      });
      refresh(batchId);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}
