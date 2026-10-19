import "server-only";
import { appPool } from "@/server/db/pool";
import { escapeLike, type Page } from "@/server/db/sql";

export type UnitListRow = {
  id: string; serial_number: string; product_id: string; product_name: string; batch_id: string; batch_code: string;
  lifecycle_status: string; label_status: string; scan_count: number; last_verified_at: Date | null;
};

const SORTS: Record<string, string> = { serial: "u.serial_number", scans: "u.scan_count", last: "u.last_verified_at", created: "u.created_at" };

export async function listUnits(f: { q?: string; batch?: string; product?: string; lifecycle?: string; label?: string; sort?: string; dir?: string }, page: Page) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replaceAll("?", `$${params.length}`)); };
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  if (f.q) add("u.serial_number like ?", `${escapeLike(f.q.toUpperCase())}%`);
  if (uuid(f.batch)) add("u.batch_id = ?", f.batch);
  if (uuid(f.product)) add("u.product_id = ?", f.product);
  if (f.lifecycle) add("u.lifecycle_status = ?", f.lifecycle);
  if (f.label) add("u.label_status = ?", f.label);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const order = `${SORTS[f.sort ?? ""] ?? "u.serial_number"} ${f.dir === "desc" ? "desc" : "asc"} ${f.sort === "last" ? "nulls last" : ""}, u.id`;
  const n = params.length;
  const [rows, total] = await Promise.all([
    appPool().query<UnitListRow>(
      `select u.id, u.serial_number, u.product_id, p.name as product_name, u.batch_id, b.batch_code, u.lifecycle_status, u.label_status, u.scan_count, u.last_verified_at
       from public.part_units u join public.products p on p.id = u.product_id join public.manufacturing_batches b on b.id = u.batch_id ${w}
       order by ${order} limit $${n + 1} offset $${n + 2}`, [...params, page.pageSize, page.offset]),
    // An exact count over 10k+ rows is cheap with these indexes; beyond a million, switch to an estimate.
    appPool().query<{ c: number }>(`select count(*)::int c from public.part_units u ${w}`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0]!.c };
}

export async function getUnit(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await appPool().query(
    `select u.*, p.name as product_name, p.sku, p.part_number, p.image_path, b.batch_code, b.release_status as batch_release_status
     from public.part_units u join public.products p on p.id = u.product_id join public.manufacturing_batches b on b.id = u.batch_id where u.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function unitTokens(id: string) {
  const { rows } = await appPool().query(
    `select t.id, t.status, t.issued_at, t.issued_by, t.revoked_at, t.revocation_reason, t.replaced_by_token_id, t.label_job_id, m.email as issued_by_email
     from public.part_tokens t left join public.admin_memberships m on m.user_id = t.issued_by where t.unit_id = $1 order by t.issued_at desc`, [id]);
  return rows as { id: string; status: string; issued_at: Date; revoked_at: Date | null; revocation_reason: string | null; replaced_by_token_id: string | null; label_job_id: string | null; issued_by_email: string | null }[];
}

export async function unitLabelEvents(id: string) {
  const { rows } = await appPool().query(
    `select e.id, e.event_type, e.note, e.created_at, m.email as actor_email, e.job_id
     from public.label_events e left join public.admin_memberships m on m.user_id = e.actor_id where e.unit_id = $1 order by e.id desc limit 20`, [id]);
  return rows as { id: number; event_type: string; note: string | null; created_at: Date; actor_email: string | null; job_id: string | null }[];
}

export async function unitEvents(id: string) {
  const { rows } = await appPool().query(
    `select id, result, channel, credential_kind, country, ua_class, risk_score, risk_reasons, created_at from public.verification_events where unit_id = $1 order by id desc limit 15`, [id]);
  return rows as { id: number; result: string; channel: string; credential_kind: string | null; country: string | null; ua_class: string | null; risk_score: number; risk_reasons: string[]; created_at: Date }[];
}

export async function unitSignals(id: string) {
  const [stats, inv, recall] = await Promise.all([
    appPool().query(`select count(*) filter (where channel = 'customer')::int customer_events, count(*) filter (where channel = 'qc')::int qc_events,
        count(distinct network_hash) filter (where channel = 'customer')::int networks, count(distinct country) filter (where channel = 'customer')::int countries
      from public.verification_events where unit_id = $1`, [id]),
    appPool().query("select id, reference, severity, status from public.investigations where unit_id = $1 order by opened_at desc limit 3", [id]),
    appPool().query(
      `select r.id, r.reference, r.title, r.status from public.recalls r where r.status = 'active' and (
         exists (select 1 from public.recall_units ru where ru.recall_id = r.id and ru.unit_id = $1)
         or exists (select 1 from public.recall_batches rb join public.part_units u on u.batch_id = rb.batch_id where rb.recall_id = r.id and u.id = $1)
         or exists (select 1 from public.recall_products rp join public.part_units u on u.product_id = rp.product_id where rp.recall_id = r.id and u.id = $1))`, [id]),
  ]);
  return { stats: stats.rows[0] as { customer_events: number; qc_events: number; networks: number; countries: number }, investigations: inv.rows as { id: string; reference: string; severity: string; status: string }[], recalls: recall.rows as { id: string; reference: string; title: string; status: string }[] };
}
