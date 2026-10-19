import "server-only";
import { appPool } from "@/server/db/pool";
import { escapeLike, type Page } from "@/server/db/sql";

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export async function listAudit(f: { q?: string; actor?: string; target?: string; from?: string; to?: string }, page: Page) {
  const w: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); w.push(sql.replaceAll("?", `$${params.length}`)); };
  if (f.q) add("a.action like ?", `${escapeLike(f.q.toLowerCase())}%`);
  if (f.actor) add("lower(a.actor_email) like ?", `${escapeLike(f.actor.toLowerCase())}%`);
  if (f.target) add("a.target_type = ?", f.target);
  if (isDate(f.from)) add("a.created_at >= (?::date at time zone 'UTC')", f.from);
  if (isDate(f.to)) add("a.created_at < ((?::date + 1) at time zone 'UTC')", f.to);
  const sql = w.length ? `where ${w.join(" and ")}` : "";
  const n = params.length;
  const [rows, total] = await Promise.all([
    appPool().query(`select a.id, a.created_at, a.actor_email, a.actor_role, a.action, a.target_type, a.target_id, a.metadata, a.request_id from public.audit_logs a ${sql} order by a.id desc limit $${n + 1} offset $${n + 2}`, [...params, page.pageSize, page.offset]),
    appPool().query<{ c: number }>(`select count(*)::int c from public.audit_logs a ${sql}`, params),
  ]);
  return { rows: rows.rows as { id: number; created_at: Date; actor_email: string | null; actor_role: string | null; action: string; target_type: string | null; target_id: string | null; metadata: Record<string, unknown>; request_id: string | null }[], total: total.rows[0]!.c };
}

export async function auditTargetTypes() {
  const { rows } = await appPool().query<{ target_type: string }>("select distinct target_type from public.audit_logs where target_type is not null order by 1");
  return rows.map((r) => r.target_type);
}
