"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { mapDbError, validationFailure } from "@/server/action-utils";
import { reasonSchema } from "@/lib/schemas/batch";
import { labelSpecSchema } from "@/server/labels/spec";
import { getSiteSettings } from "@/server/settings";

const refresh = (id: string) => { revalidatePath(`/admin/part-units/${id}`); revalidatePath("/admin/part-units"); revalidatePath("/admin/dashboard"); };

export async function revokeToken(unitId: string, input: unknown): Promise<ActionResult> {
  return authorized("labels.reissue", async (staff) => {
    const parsed = reasonSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    try {
      const revokedId = await withTransaction(async (c) => {
        const id = (await c.query<{ id: string | null }>("select public.revoke_part_token($1, $2, $3) as id", [unitId, staff.userId, parsed.data.reason])).rows[0]!.id;
        if (id) await writeAudit(staff, { action: "token.revoke", targetType: "unit", targetId: unitId, metadata: { tokenId: id, reason: parsed.data.reason } }, c);
        return id;
      });
      if (!revokedId) return { ok: false, code: "conflict", error: "This unit has no active code to revoke." };
      refresh(unitId);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

/** Creates a one-unit reissue job. The old credential stays valid until the new PDF is generated and the swap commits. */
export async function requestLabelReplacement(unitId: string, input: unknown): Promise<ActionResult<{ jobId: string }>> {
  return authorized("labels.reissue", async (staff) => {
    const parsed = reasonSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    try {
      const settings = await getSiteSettings();
      const spec = labelSpecSchema.parse(settings.labelSpec);
      const out = await withTransaction(async (c) => {
        const unit = (await c.query<{ batch_id: string; serial_number: string }>("select batch_id, serial_number from public.part_units where id = $1", [unitId])).rows[0];
        if (!unit) return null;
        const job = (await c.query<{ r: { jobId: string } }>("select public.create_label_job($1, 'reissue', 1, $2, $3, $4, $5::uuid[], 1, $6) as r", [unit.batch_id, randomUUID(), JSON.stringify(spec), staff.userId, [unitId], parsed.data.reason])).rows[0]!.r;
        await writeAudit(staff, { action: "label.replace_requested", targetType: "unit", targetId: unitId, metadata: { jobId: job.jobId, serial: unit.serial_number, reason: parsed.data.reason } }, c);
        return job;
      });
      if (!out) return { ok: false, code: "failed", error: "That unit no longer exists." };
      refresh(unitId);
      return { ok: true, data: { jobId: out.jobId } };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

type UnitTransition = "quarantined" | "restored" | "retired";
const PERM = { quarantined: "batches.quarantine", restored: "batches.quarantine", retired: "units.retire" } as const;

export async function transitionUnit(unitId: string, to: UnitTransition, input?: unknown): Promise<ActionResult> {
  return authorized(PERM[to], async (staff) => {
    let reason: string | null = null;
    if (to !== "restored") {
      const parsed = reasonSchema.safeParse(input);
      if (!parsed.success) return validationFailure(parsed.error);
      reason = parsed.data.reason;
    }
    try {
      const res = await withTransaction(async (c) => {
        const r = (await c.query("select public.transition_units($1, $2, $3, null, $4::uuid[]) as r", [to, staff.userId, reason, [unitId]])).rows[0]!.r as { changed: number };
        if (r.changed === 0) return "That unit isn't in a state where this action applies.";
        await writeAudit(staff, { action: `unit.${to === "quarantined" ? "quarantine" : to === "restored" ? "restore" : "retire"}`, targetType: "unit", targetId: unitId, metadata: reason ? { reason } : {} }, c);
        return null;
      });
      if (res) return { ok: false, code: "conflict", error: res };
      refresh(unitId);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

export async function reportLabelDamage(unitId: string, input: unknown): Promise<ActionResult> {
  return authorized("labels.confirm", async (staff) => {
    const parsed = reasonSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    try {
      await withTransaction(async (c) => {
        await c.query("select public.report_label_damage($1, $2, $3)", [unitId, staff.userId, parsed.data.reason]);
        await writeAudit(staff, { action: "label.damage_reported", targetType: "unit", targetId: unitId, metadata: { note: parsed.data.reason } }, c);
      });
      refresh(unitId);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}
