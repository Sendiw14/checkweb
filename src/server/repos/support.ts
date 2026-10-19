import "server-only";
import { appPool } from "@/server/db/pool";
import { escapeLike, type Page } from "@/server/db/sql";

export async function listCases(f: { q?: string; status?: string; kind?: string; mine?: string }, staffId: string, page: Page) {
  const w: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); w.push(sql.replace("?", `$${params.length}`)); };
  if (f.status === "active") w.push("s.status in ('new', 'open', 'waiting_customer')");
  else if (f.status) add("s.status = ?", f.status);
  if (f.kind) add("s.kind = ?", f.kind);
  if (f.mine === "1") add("s.assigned_to = ?", staffId);
  if (f.q) {
    params.push(`${escapeLike(f.q.toUpperCase())}%`, `%${escapeLike(f.q.toLowerCase())}%`);
    w.push(`(s.reference like $${params.length - 1} or s.serial_reference like $${params.length - 1} or lower(s.subject) like $${params.length})`);
  }
  const sql = w.length ? `where ${w.join(" and ")}` : "";
  const text = sql;
  const n = params.length;
  const [rows, total] = await Promise.all([
    appPool().query(`select s.id, s.reference, s.kind, s.status, s.subject, s.created_at, s.serial_reference, s.unit_id, m.email as assigned_email,
         case when s.purged_at is not null then null else coalesce(s.contact_name, s.contact_email, s.contact_phone) end as who
       from public.support_cases s left join public.admin_memberships m on m.user_id = s.assigned_to ${text}
       order by (s.status = 'new') desc, s.created_at desc limit $${n + 1} offset $${n + 2}`, [...params, page.pageSize, page.offset]),
    appPool().query<{ c: number }>(`select count(*)::int c from public.support_cases s ${text}`, params),
  ]);
  return { rows: rows.rows as { id: string; reference: string; kind: string; status: string; subject: string; created_at: Date; serial_reference: string | null; unit_id: string | null; assigned_email: string | null; who: string | null }[], total: total.rows[0]!.c };
}

export async function getCase(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await appPool().query(
    `select s.*, m.email as assigned_email, u.serial_number as unit_serial, p.name as product_name, i.reference as investigation_ref
     from public.support_cases s left join public.admin_memberships m on m.user_id = s.assigned_to left join public.part_units u on u.id = s.unit_id left join public.products p on p.id = u.product_id left join public.investigations i on i.id = s.investigation_id
     where s.id = $1`, [id]);
  return rows[0] ?? null;
}
