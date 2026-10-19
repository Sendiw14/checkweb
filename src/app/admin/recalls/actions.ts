"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { can } from "@/server/auth/permissions";
import { mapDbError, validationFailure } from "@/server/action-utils";

const refresh = (id?: string) => { revalidatePath("/admin/recalls"); if (id) revalidatePath(`/admin/recalls/${id}`); revalidatePath("/admin/dashboard"); };

const recallSchema = z.object({
  title: z.string().trim().min(3, "Give the recall a title.").max(160),
  reason: z.string().trim().min(3, "Record why this recall exists (internal).").max(4000),
  publicInstructions: z.string().trim().max(4000, "Keep the instructions under 4,000 characters.").optional().transform((v) => v || undefined),
});

export async function createRecall(input: unknown): Promise<ActionResult<{ id: string }>> {
  return authorized("recalls.write", async (staff) => {
    const p = recallSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      const id = await withTransaction(async (c) => {
        const r = await c.query<{ id: string }>("insert into public.recalls (title, reason, public_instructions, created_by) values ($1, $2, $3, $4) returning id", [p.data.title, p.data.reason, p.data.publicInstructions ?? null, staff.userId]);
        await writeAudit(staff, { action: "recall.create", targetType: "recall", targetId: r.rows[0]!.id, metadata: { title: p.data.title } }, c);
        return r.rows[0]!.id;
      });
      refresh();
      return { ok: true, data: { id } };
    } catch (err) { return mapDbError(err); }
  });
}

/**
 * Editing customer-facing instructions. In draft anyone with recalls.write can edit (approval comes at activation).
 * Once a recall is ACTIVE, customers see this text, so only someone who can activate may change it, and the edit is itself the approval.
 */
export async function updateRecall(id: string, input: unknown): Promise<ActionResult> {
  return authorized("recalls.write", async (staff) => {
    const p = recallSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      const res = await withTransaction(async (c) => {
        const cur = (await c.query<{ status: string }>("select status from public.recalls where id = $1 for update", [id])).rows[0];
        if (!cur) return "That recall no longer exists.";
        if (cur.status === "closed") return "A closed recall can't be edited.";
        if (cur.status === "active" && !can(staff.role, "recalls.activate")) return "Only someone who can approve recalls may change the instructions of an active recall.";
        if (cur.status === "active" && !p.data.publicInstructions) return "An active recall must keep customer instructions.";
        const approves = cur.status === "active";
        await c.query(
          `update public.recalls set title = $2, reason = $3, public_instructions = $4,
             instructions_approved_by = case when $5 then $6::uuid else instructions_approved_by end, instructions_approved_at = case when $5 then now() else instructions_approved_at end where id = $1`,
          [id, p.data.title, p.data.reason, p.data.publicInstructions ?? null, approves, staff.userId]);
        await writeAudit(staff, { action: approves ? "recall.instructions_updated_active" : "recall.update", targetType: "recall", targetId: id }, c);
        return null;
      });
      if (res) return { ok: false, code: "conflict", error: res };
      refresh(id);
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("product"), productId: z.string().uuid() }),
  z.object({ kind: z.literal("batch"), batchId: z.string().uuid() }),
  z.object({ kind: z.literal("units"), serials: z.string().trim().min(1, "Enter at least one serial number.").max(20_000) }),
]);

export async function addRecallScope(id: string, input: unknown): Promise<ActionResult<{ added: number; unknown: string[] }>> {
  return authorized<{ added: number; unknown: string[] }>("recalls.write", async (staff) => {
    const p = scopeSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      const out = await withTransaction(async (c) => {
        const st = (await c.query<{ status: string }>("select status from public.recalls where id = $1 for update", [id])).rows[0];
        if (!st) throw Object.assign(new Error("That recall no longer exists."), { code: "P0001" });
        if (st.status === "closed") throw Object.assign(new Error("A closed recall can't be changed."), { code: "P0001" });
        let added = 0; let unknown: string[] = [];
        if (p.data.kind === "product") added = (await c.query("insert into public.recall_products values ($1, $2) on conflict do nothing", [id, p.data.productId])).rowCount ?? 0;
        else if (p.data.kind === "batch") added = (await c.query("insert into public.recall_batches values ($1, $2) on conflict do nothing", [id, p.data.batchId])).rowCount ?? 0;
        else {
          const serials = [...new Set(p.data.serials.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 5000);
          const found = await c.query<{ id: string; serial_number: string }>("select id, serial_number from public.part_units where serial_number = any($1::text[])", [serials]);
          const have = new Set(found.rows.map((r) => r.serial_number));
          unknown = serials.filter((s) => !have.has(s));
          if (found.rowCount) added = (await c.query("insert into public.recall_units select $1, unnest($2::uuid[]) on conflict do nothing", [id, found.rows.map((r) => r.id)])).rowCount ?? 0;
        }
        await writeAudit(staff, { action: "recall.scope_add", targetType: "recall", targetId: id, metadata: { kind: p.data.kind, added } }, c);
        return { added, unknown };
      });
      refresh(id);
      return { ok: true, data: out };
    } catch (err) { return mapDbError(err); }
  });
}

export async function removeRecallScope(id: string, kind: "product" | "batch" | "unit", targetId: string): Promise<ActionResult> {
  return authorized("recalls.write", async (staff) => {
    const table = { product: ["recall_products", "product_id"], batch: ["recall_batches", "batch_id"], unit: ["recall_units", "unit_id"] }[kind];
    if (!table || !/^[0-9a-f-]{36}$/i.test(targetId)) return { ok: false, code: "validation", error: "Invalid request." };
    try {
      await withTransaction(async (c) => {
        const st = (await c.query<{ status: string }>("select status from public.recalls where id = $1 for update", [id])).rows[0];
        if (!st || st.status === "closed") throw Object.assign(new Error("A closed recall can't be changed."), { code: "P0001" });
        if (st.status === "active") {
          const left = await c.query(`select (select count(*) from public.recall_products where recall_id = $1) + (select count(*) from public.recall_batches where recall_id = $1) + (select count(*) from public.recall_units where recall_id = $1) as n`, [id]);
          if (Number(left.rows[0].n) <= 1) throw Object.assign(new Error("An active recall must cover at least one product, batch or unit. Close the recall instead."), { code: "P0001" });
        }
        await c.query(`delete from public.${table[0]} where recall_id = $1 and ${table[1]} = $2`, [id, targetId]);
        await writeAudit(staff, { action: "recall.scope_remove", targetType: "recall", targetId: id, metadata: { kind, target: targetId } }, c);
      });
      refresh(id);
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

/** Approving the customer text and activating are one deliberate act, by someone with recalls.activate. */
export async function activateRecall(id: string): Promise<ActionResult<{ impacted: number }>> {
  return authorized<{ impacted: number }>("recalls.activate", async (staff) => {
    try {
      const impacted = await withTransaction(async (c) => {
        const r = (await c.query<{ status: string; public_instructions: string | null }>("select status, public_instructions from public.recalls where id = $1 for update", [id])).rows[0];
        if (!r) throw Object.assign(new Error("That recall no longer exists."), { code: "P0001" });
        if (r.status !== "draft") throw Object.assign(new Error(`This recall is already ${r.status}.`), { code: "P0001" });
        if (!r.public_instructions?.trim()) throw Object.assign(new Error("Write the customer instructions before activating. Customers will see them exactly as written."), { code: "P0001" });
        const scope = await c.query(`select (select count(*) from public.recall_products where recall_id = $1) + (select count(*) from public.recall_batches where recall_id = $1) + (select count(*) from public.recall_units where recall_id = $1) as n`, [id]);
        if (Number(scope.rows[0].n) === 0) throw Object.assign(new Error("Choose what the recall covers (a product, batch or specific units) before activating."), { code: "P0001" });
        await c.query("update public.recalls set status = 'active', issued_at = now(), instructions_approved_by = $2, instructions_approved_at = now() where id = $1", [id, staff.userId]);
        const n = (await c.query<{ n: number }>(
          `select count(*)::int n from (select u.id from public.part_units u where u.id in (select unit_id from public.recall_units where recall_id = $1)
             union select u.id from public.part_units u where u.batch_id in (select batch_id from public.recall_batches where recall_id = $1)
             union select u.id from public.part_units u where u.product_id in (select product_id from public.recall_products where recall_id = $1)) x`, [id])).rows[0]!.n;
        await writeAudit(staff, { action: "recall.activate", targetType: "recall", targetId: id, metadata: { impactedUnits: n } }, c);
        return n;
      });
      refresh(id);
      return { ok: true, data: { impacted } };
    } catch (err) { return mapDbError(err); }
  });
}

export async function closeRecall(id: string, input: unknown): Promise<ActionResult> {
  return authorized("recalls.activate", async (staff) => {
    const p = z.object({ note: z.string().trim().min(3, "Say why the recall is being closed.").max(500) }).safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      await withTransaction(async (c) => {
        const r = await c.query("update public.recalls set status = 'closed', closed_at = now() where id = $1 and status in ('draft', 'active') returning id", [id]);
        if (!r.rowCount) throw Object.assign(new Error("This recall is already closed."), { code: "P0001" });
        await writeAudit(staff, { action: "recall.close", targetType: "recall", targetId: id, metadata: { note: p.data.note } }, c);
      });
      refresh(id);
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}
