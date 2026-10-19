import "server-only";
import { appPool } from "@/server/db/pool";
import { escapeLike, type Page } from "@/server/db/sql";

export type InvRow = { id: string; reference: string; severity: string; status: string; summary: string; opened_at: Date; assigned_email: string | null; unit_id: string | null; serial: string | null; origin: string; risk_reasons: string[] };

export async function listInvestigations(f: { q?: string; status?: string; severity?: string; mine?: string }, staffId: string, page: Page) {
  const w: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); w.push(sql.replaceAll("?", `$${params.length}`)); };
  if (f.status === "active") w.push("i.status in ('open', 'in_review')");
  else if (f.status) add("i.status = ?", f.status);
  if (f.severity) add("i.severity = ?", f.severity);
  if (f.mine === "1") add("i.assigned_to = ?", staffId);
  if (f.q) add("(i.reference like ? or u.serial_number like ?)", `${escapeLike(f.q.toUpperCase())}%`);
  const sql = w.length ? `where ${w.join(" and ")}` : "";
  const n = params.length;
  const from = `from public.investigations i left join public.part_units u on u.id = i.unit_id left join public.admin_memberships m on m.user_id = i.assigned_to ${sql}`;
  const [rows, total] = await Promise.all([
    appPool().query<InvRow>(`select i.id, i.reference, i.severity, i.status, i.summary, i.opened_at, i.origin, i.risk_reasons, m.email as assigned_email, i.unit_id, u.serial_number as serial ${from}
       order by (i.status in ('open','in_review')) desc, case i.severity when 'high' then 0 when 'medium' then 1 else 2 end, i.opened_at desc limit $${n + 1} offset $${n + 2}`, [...params, page.pageSize, page.offset]),
    appPool().query<{ c: number }>(`select count(*)::int c ${from}`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0]!.c };
}

export async function getInvestigation(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await appPool().query(
    `select i.*, u.serial_number as serial, p.name as product_name, b.batch_code, m.email as assigned_email, m.display_name as assigned_name, o.email as opened_by_email, r.email as resolved_by_email
     from public.investigations i left join public.part_units u on u.id = i.unit_id left join public.products p on p.id = u.product_id left join public.manufacturing_batches b on b.id = coalesce(i.batch_id, u.batch_id)
       left join public.admin_memberships m on m.user_id = i.assigned_to left join public.admin_memberships o on o.user_id = i.opened_by left join public.admin_memberships r on r.user_id = i.resolved_by
     where i.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function investigationNotes(id: string) {
  const { rows } = await appPool().query(
    `select n.id, n.body, n.created_at, m.email as author_email, m.display_name as author_name from public.investigation_notes n left join public.admin_memberships m on m.user_id = n.author_id where n.investigation_id = $1 order by n.id`, [id]);
  return rows as { id: number; body: string; created_at: Date; author_email: string | null; author_name: string | null }[];
}

export async function assignableStaff() {
  const { rows } = await appPool().query("select user_id, email, display_name, role from public.admin_memberships where status = 'active' and role in ('owner','admin','support_agent') order by lower(email)");
  return rows as { user_id: string; email: string; display_name: string; role: string }[];
}

export async function investigationScans(unitId: string) {
  const { rows } = await appPool().query(
    `select id, result, country, ua_class, risk_reasons, created_at from public.verification_events where unit_id = $1 and channel = 'customer' order by id desc limit 10`, [unitId]);
  return rows as { id: number; result: string; country: string | null; ua_class: string | null; risk_reasons: string[]; created_at: Date }[];
}
