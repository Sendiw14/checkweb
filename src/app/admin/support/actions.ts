"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { mapDbError, validationFailure } from "@/server/action-utils";
import { SUPPORT_STATUSES } from "@/server/domain/enums";

const refresh = (id: string) => { revalidatePath("/admin/support"); revalidatePath(`/admin/support/${id}`); revalidatePath("/admin/dashboard"); };

export async function assignCase(id: string, userId: string | null): Promise<ActionResult> {
  return authorized("support.manage", async (staff) => {
    try {
      await withTransaction(async (c) => {
        if (userId) { const ok = await c.query("select 1 from public.admin_memberships where user_id = $1 and status = 'active' and role in ('owner','admin','support_agent')", [userId]); if (!ok.rowCount) throw Object.assign(new Error("That person can't be assigned support cases."), { code: "P0001" }); }
        await c.query("update public.support_cases set assigned_to = $2, status = case when status = 'new' and $2::uuid is not null then 'open' else status end where id = $1", [id, userId]);
        await writeAudit(staff, { action: "support.assign", targetType: "support_case", targetId: id, metadata: { assignedTo: userId } }, c);
      });
      refresh(id);
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

const statusSchema = z.object({ status: z.enum(SUPPORT_STATUSES), resolution: z.string().trim().max(4000).optional() });

export async function setCaseStatus(id: string, input: unknown): Promise<ActionResult> {
  return authorized("support.manage", async (staff) => {
    const p = statusSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    const closing = ["resolved", "closed"].includes(p.data.status);
    if (closing && (!p.data.resolution || p.data.resolution.length < 3)) return { ok: false, code: "validation", error: "Record how this was resolved.", fieldErrors: { resolution: "Add a short resolution note." } };
    try {
      await withTransaction(async (c) => {
        await c.query("update public.support_cases set status = $2, resolution = case when $3 then $4 else resolution end, resolved_at = case when $3 then coalesce(resolved_at, now()) else null end where id = $1", [id, p.data.status, closing, p.data.resolution ?? null]);
        await writeAudit(staff, { action: "support.status", targetType: "support_case", targetId: id, metadata: { status: p.data.status } }, c);
      });
      refresh(id);
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

export async function linkCaseUnit(id: string, serial: string): Promise<ActionResult<{ serial: string }>> {
  return authorized<{ serial: string }>("support.manage", async (staff) => {
    const s = String(serial).trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{3,38}[A-Z0-9]$/.test(s)) return { ok: false, code: "validation", error: "That doesn't look like a serial number." };
    try {
      const found = await withTransaction(async (c) => {
        const u = (await c.query<{ id: string }>("select id from public.part_units where serial_number = $1", [s])).rows[0];
        if (!u) return false;
        await c.query("update public.support_cases set unit_id = $2 where id = $1", [id, u.id]);
        await writeAudit(staff, { action: "support.link_unit", targetType: "support_case", targetId: id, metadata: { serial: s } }, c);
        return true;
      });
      if (!found) return { ok: false, code: "conflict", error: "No unit has that serial number." };
      refresh(id);
      return { ok: true, data: { serial: s } };
    } catch (err) { return mapDbError(err); }
  });
}

/** Escalate a case to an investigation (needs a linked unit). The case then points at the investigation. */
export async function escalateCase(id: string): Promise<ActionResult<{ investigationId: string }>> {
  return authorized<{ investigationId: string }>("investigations.manage", async (staff) => {
    try {
      const out = await withTransaction(async (c) => {
        const s = (await c.query<{ unit_id: string | null; subject: string; reference: string; investigation_id: string | null }>("select unit_id, subject, reference, investigation_id from public.support_cases where id = $1 for update", [id])).rows[0];
        if (!s) throw Object.assign(new Error("That case no longer exists."), { code: "P0001" });
        if (s.investigation_id) return s.investigation_id;
        if (!s.unit_id) throw Object.assign(new Error("Link the part's serial number to this case first."), { code: "P0001" });
        const unit = (await c.query<{ batch_id: string }>("select batch_id from public.part_units where id = $1", [s.unit_id])).rows[0]!;
        const existing = await c.query<{ id: string }>("select id from public.investigations where unit_id = $1 and status in ('open','in_review')", [s.unit_id]);
        let invId = existing.rows[0]?.id;
        if (!invId) {
          invId = (await c.query<{ id: string }>("insert into public.investigations (unit_id, batch_id, origin, severity, summary, opened_by) values ($1, $2, 'support_case', 'medium', $3, $4) returning id", [s.unit_id, unit.batch_id, `From support case ${s.reference}: ${s.subject}`.slice(0, 1000), staff.userId])).rows[0]!.id;
        }
        await c.query("update public.support_cases set investigation_id = $2 where id = $1", [id, invId]);
        await writeAudit(staff, { action: "support.escalate", targetType: "support_case", targetId: id, metadata: { investigationId: invId } }, c);
        return invId;
      });
      refresh(id);
      return { ok: true, data: { investigationId: out } };
    } catch (err) { return mapDbError(err); }
  });
}
