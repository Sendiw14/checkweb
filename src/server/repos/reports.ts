import "server-only";
import { appPool } from "@/server/db/pool";

export type Range = { from: string; to: string };

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

/** Dates are UTC days. Default: the last 30 days. Capped at 92 days so a chart stays readable and queries cheap. */
export function resolveRange(f: { from?: string; to?: string }): Range {
  const to = isDate(f.to) ? f.to! : today();
  let from = isDate(f.from) ? f.from! : addDays(to, -29);
  if (from > to) from = to;
  if (Date.parse(to) - Date.parse(from) > 91 * 86_400_000) from = addDays(to, -91);
  return { from, to };
}

export async function verificationSeries(r: Range, productId?: string) {
  const { rows } = await appPool().query(
    `select to_char(d, 'YYYY-MM-DD') as day,
       count(e.id) filter (where e.result in ('recognized_first', 'recognized_repeat'))::int recognized,
       count(e.id) filter (where e.result = 'suspicious')::int suspicious,
       count(e.id) filter (where e.result = 'invalid')::int invalid,
       count(e.id) filter (where e.result in ('revoked', 'recalled', 'quarantined', 'not_released', 'retired'))::int flagged
     from generate_series($1::date, $2::date, interval '1 day') d
     left join (select e.* from public.verification_events e left join public.part_units u on u.id = e.unit_id where e.channel = 'customer' and ($3::uuid is null or u.product_id = $3)) e
       on e.created_at >= (d at time zone 'UTC') and e.created_at < ((d + interval '1 day') at time zone 'UTC')
     group by d order by d`, [r.from, r.to, productId ?? null]);
  return rows as { day: string; recognized: number; suspicious: number; invalid: number; flagged: number }[];
}

export async function weeklyTotals(r: Range, productId?: string) {
  const { rows } = await appPool().query(
    `select to_char(date_trunc('week', e.created_at at time zone 'UTC'), 'YYYY-MM-DD') as week, count(*)::int total,
       count(*) filter (where e.result = 'recognized_repeat')::int repeat, count(*) filter (where e.result = 'invalid')::int invalid
     from public.verification_events e left join public.part_units u on u.id = e.unit_id
     where e.channel = 'customer' and e.created_at >= ($1::date at time zone 'UTC') and e.created_at < (($2::date + 1) at time zone 'UTC') and ($3::uuid is null or u.product_id = $3)
     group by 1 order by 1`, [r.from, r.to, productId ?? null]);
  return rows as { week: string; total: number; repeat: number; invalid: number }[];
}

export async function outcomeBreakdown(r: Range, productId?: string) {
  const { rows } = await appPool().query(
    `select e.result, count(*)::int n from public.verification_events e left join public.part_units u on u.id = e.unit_id
     where e.channel = 'customer' and e.created_at >= ($1::date at time zone 'UTC') and e.created_at < (($2::date + 1) at time zone 'UTC') and ($3::uuid is null or u.product_id = $3)
     group by 1 order by 2 desc`, [r.from, r.to, productId ?? null]);
  return rows as { result: string; n: number }[];
}

export async function unitsByProduct() {
  const { rows } = await appPool().query(
    `select p.id, p.name, p.sku, count(u.id)::int total, count(u.id) filter (where u.lifecycle_status = 'released')::int released,
       count(u.id) filter (where u.lifecycle_status in ('registered','qc_passed'))::int pending, count(u.id) filter (where u.lifecycle_status = 'quarantined')::int quarantined,
       count(u.id) filter (where u.lifecycle_status = 'retired')::int retired
     from public.products p left join public.part_units u on u.product_id = p.id group by p.id order by total desc, lower(p.name)`);
  return rows as { id: string; name: string; sku: string; total: number; released: number; pending: number; quarantined: number; retired: number }[];
}

export async function jobStats(r: Range) {
  const [s, f] = await Promise.all([
    appPool().query(`select state, count(*)::int n, coalesce(sum(units_done), 0)::int units from public.label_jobs where created_at >= ($1::date at time zone 'UTC') and created_at < (($2::date + 1) at time zone 'UTC') group by state`, [r.from, r.to]),
    appPool().query(`select j.id, b.batch_code, j.error_summary, j.created_at from public.label_jobs j join public.manufacturing_batches b on b.id = j.batch_id where j.state = 'failed' and j.created_at >= ($1::date at time zone 'UTC') and j.created_at < (($2::date + 1) at time zone 'UTC') order by j.created_at desc limit 5`, [r.from, r.to]),
  ]);
  return { byState: s.rows as { state: string; n: number; units: number }[], failures: f.rows as { id: string; batch_code: string; error_summary: string | null; created_at: Date }[] };
}

export async function investigationStats() {
  const { rows } = await appPool().query("select status, severity, count(*)::int n from public.investigations group by 1, 2 order by 1, 2");
  return rows as { status: string; severity: string; n: number }[];
}

export async function holdsAndRecalls() {
  const [q, r] = await Promise.all([
    appPool().query("select count(*) filter (where lifecycle_status = 'quarantined')::int quarantined_units, (select count(*)::int from public.manufacturing_batches where release_status = 'quarantined') quarantined_batches from public.part_units"),
    appPool().query("select status, count(*)::int n from public.recalls group by 1"),
  ]);
  return { quarantinedUnits: q.rows[0].quarantined_units as number, quarantinedBatches: q.rows[0].quarantined_batches as number, recalls: r.rows as { status: string; n: number }[] };
}

export async function adminActivity(r: Range) {
  const { rows } = await appPool().query(
    `select split_part(action, '.', 1) as area, count(*)::int n from public.audit_logs where created_at >= ($1::date at time zone 'UTC') and created_at < (($2::date + 1) at time zone 'UTC') group by 1 order by 2 desc limit 12`, [r.from, r.to]);
  return rows as { area: string; n: number }[];
}
