import "server-only";
import { appPool } from "@/server/db/pool";
import { escapeLike, type Page } from "@/server/db/sql";

export type ScanRow = {
  id: number; result: string; channel: string; credential_kind: string | null; request_id: string; country: string | null; ua_class: string | null;
  risk_score: number; risk_reasons: string[]; created_at: Date; unit_id: string | null; serial: string | null; product_name: string | null; part_number: string | null; batch_code: string | null;
};

export type ScanFilters = { q?: string; result?: string; channel?: string; from?: string; to?: string; product?: string; batch?: string; flagged?: string };

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

function where(f: ScanFilters) {
  const w: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); w.push(sql.replaceAll("?", `$${params.length}`)); };
  // Customer scans by default: staff QC and bot traffic are opt-in so they never pollute the picture.
  add("e.channel = ?", ["customer", "qc", "automated"].includes(f.channel ?? "") ? f.channel : "customer");
  if (f.result) add("e.result = ?", f.result);
  if (f.q) add("u.serial_number like ?", `${escapeLike(f.q.toUpperCase())}%`);
  if (isDate(f.from)) add("e.created_at >= (?::date at time zone 'UTC')", f.from);
  if (isDate(f.to)) add("e.created_at < ((?::date + 1) at time zone 'UTC')", f.to);
  if (uuid(f.product)) add("u.product_id = ?", f.product);
  if (uuid(f.batch)) add("u.batch_id = ?", f.batch);
  if (f.flagged === "1") w.push("e.risk_score > 0");
  return { sql: w.length ? `where ${w.join(" and ")}` : "", params };
}

export async function listScans(f: ScanFilters, page: Page, includeSignals: boolean) {
  const { sql, params } = where(f);
  const n = params.length;
  const [rows, total] = await Promise.all([
    appPool().query<ScanRow>(
      `select e.id, e.result, e.channel, e.credential_kind, e.request_id, e.country, e.ua_class, e.risk_score, ${includeSignals ? "e.risk_reasons" : "'{}'::text[]"} as risk_reasons, e.created_at,
         e.unit_id, u.serial_number as serial, p.name as product_name, p.part_number, b.batch_code
       from public.verification_events e left join public.part_units u on u.id = e.unit_id left join public.products p on p.id = u.product_id left join public.manufacturing_batches b on b.id = u.batch_id
       ${sql} order by e.id desc limit $${n + 1} offset $${n + 2}`, [...params, page.pageSize, page.offset]),
    appPool().query<{ c: number }>(`select count(*)::int c from public.verification_events e left join public.part_units u on u.id = e.unit_id ${sql}`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0]!.c };
}

export async function scanSummary(f: ScanFilters) {
  const { sql, params } = where(f);
  const { rows } = await appPool().query(
    `select count(*)::int total, count(*) filter (where e.result in ('recognized_first','recognized_repeat'))::int recognized,
       count(*) filter (where e.result = 'suspicious')::int suspicious, count(*) filter (where e.result = 'invalid')::int invalid,
       count(*) filter (where e.result in ('revoked','recalled','quarantined','not_released','retired'))::int flagged
     from public.verification_events e left join public.part_units u on u.id = e.unit_id ${sql}`, params);
  return rows[0] as { total: number; recognized: number; suspicious: number; invalid: number; flagged: number };
}
