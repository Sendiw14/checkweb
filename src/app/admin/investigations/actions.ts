"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { mapDbError, validationFailure } from "@/server/action-utils";
import { INVESTIGATION_SEVERITIES, INVESTIGATION_STATUSES } from "@/server/domain/enums";

const refresh = (id?: string) => { revalidatePath("/admin/investigations"); if (id) revalidatePath(`/admin/investigations/${id}`); revalidatePath("/admin/dashboard"); };

const noteSchema = z.object({ body: z.string().trim().min(1, "Write a note first.").max(4000, "Keep notes under 4,000 characters.") });
const statusSchema = z.object({ status: z.enum(INVESTIGATION_STATUSES), notes: z.string().trim().max(4000).optional() });
const openSchema = z.object({ unitId: z.string().uuid(), summary: z.string().trim().min(3, "Describe what you're concerned about.").max(1000), severity: z.enum(INVESTIGATION_SEVERITIES).default("medium") });

export async function addNote(id: string, input: unknown): Promise<ActionResult> {
  return authorized("investigations.manage", async (staff) => {
    const p = noteSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      await withTransaction(async (c) => {
        await c.query("insert into public.investigation_notes (investigation_id, author_id, body) values ($1, $2, $3)", [id, staff.userId, p.data.body]);
        await c.query("update public.investigations set updated_at = now() where id = $1", [id]);
        await writeAudit(staff, { action: "investigation.note", targetType: "investigation", targetId: id }, c);
      });
      refresh(id);
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

export async function assignInvestigation(id: string, userId: string | null): Promise<ActionResult> {
  return authorized("investigations.manage", async (staff) => {
    try {
      await withTransaction(async (c) => {
        if (userId) {
          const ok = await c.query("select 1 from public.admin_memberships where user_id = $1 and status = 'active' and role in ('owner','admin','support_agent')", [userId]);
          if (!ok.rowCount) throw Object.assign(new Error("That person can't be assigned investigations."), { code: "P0001" });
        }
        await c.query("update public.investigations set assigned_to = $2, status = case when status = 'open' and $2::uuid is not null then 'in_review' else status end where id = $1 and status in ('open', 'in_review')", [id, userId]);
        await writeAudit(staff, { action: "investigation.assign", targetType: "investigation", targetId: id, metadata: { assignedTo: userId } }, c);
      });
      refresh(id);
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

export async function setInvestigationStatus(id: string, input: unknown): Promise<ActionResult> {
  return authorized("investigations.manage", async (staff) => {
    const p = statusSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    const resolving = !["open", "in_review"].includes(p.data.status);
    if (resolving && (!p.data.notes || p.data.notes.length < 3)) return { ok: false, code: "validation", error: "Explain the outcome so there is a record.", fieldErrors: { notes: "Add a short explanation of how this was resolved." } };
    try {
      await withTransaction(async (c) => {
        await c.query(
          `update public.investigations set status = $2, resolved_at = case when $3 then now() else null end, resolved_by = case when $3 then $4::uuid else null end,
             resolution_notes = case when $3 then $5 else resolution_notes end where id = $1`, [id, p.data.status, resolving, staff.userId, p.data.notes ?? null]);
        await writeAudit(staff, { action: "investigation.status", targetType: "investigation", targetId: id, metadata: { status: p.data.status } }, c);
      });
      refresh(id);
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

/** Staff-initiated case (for example from a support report). One open case per unit is enforced by the database. */
export async function openInvestigation(input: unknown): Promise<ActionResult<{ id: string }>> {
  return authorized("investigations.manage", async (staff) => {
    const p = openSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      const out = await withTransaction(async (c) => {
        const unit = (await c.query<{ batch_id: string }>("select batch_id from public.part_units where id = $1", [p.data.unitId])).rows[0];
        if (!unit) return null;
        const open = await c.query<{ id: string }>("select id from public.investigations where unit_id = $1 and status in ('open','in_review')", [p.data.unitId]);
        if (open.rows[0]) return { id: open.rows[0].id, existing: true };
        const r = await c.query<{ id: string }>("insert into public.investigations (unit_id, batch_id, origin, severity, summary, opened_by) values ($1, $2, 'manual', $3, $4, $5) returning id", [p.data.unitId, unit.batch_id, p.data.severity, p.data.summary, staff.userId]);
        await writeAudit(staff, { action: "investigation.open", targetType: "investigation", targetId: r.rows[0]!.id, metadata: { unitId: p.data.unitId } }, c);
        return { id: r.rows[0]!.id, existing: false };
      });
      if (!out) return { ok: false, code: "failed", error: "That unit no longer exists." };
      refresh();
      return { ok: true, data: { id: out.id } };
    } catch (err) { return mapDbError(err); }
  });
}

