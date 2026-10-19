import "server-only";
import { appPool } from "@/server/db/pool";
import { can } from "@/server/auth/permissions";
import type { Staff } from "@/server/auth/session";

export type DashboardData = {
  units: { total: number; released: number; pending: number; quarantined: number };
  today: { total: number; recognized: number; invalid: number; repeat: number; suspicious: number };
  openInvestigations: { open: number; high: number } | null;
  series: { day: string; recognized: number; suspicious: number; invalid: number; flagged: number }[];
  batches: { id: string; code: string; product: string; expected: number; registered: number; labelled: number; applied: number; released: number; releaseStatus: string }[];
  jobs: { id: string; batchCode: string; state: string; done: number; requested: number; kind: string; createdAt: Date }[];
  recentScans: { id: number; result: string; at: Date; serial: string | null; country: string | null; unitId: string | null }[] | null;
  recentAudit: { id: number; action: string; actor: string | null; at: Date; target: string | null }[] | null;
};

export async function getDashboard(staff: Staff): Promise<DashboardData> {
  const pool = appPool();
  const canScans = can(staff.role, "scans.read");
  const canInv = can(staff.role, "investigations.read");
  const canAudit = can(staff.role, "audit.read");
  const canLabels = can(staff.role, "labels.read");

  const [units, today, series, batches, inv, jobs, scans, audit] = await Promise.all([
    pool.query(`select count(*)::int total,
        count(*) filter (where lifecycle_status = 'released')::int released,
        count(*) filter (where lifecycle_status in ('registered', 'qc_passed'))::int pending,
        count(*) filter (where lifecycle_status = 'quarantined')::int quarantined
      from public.part_units`),
    canScans || can(staff.role, "dashboard.view")
      ? pool.query(`select count(*)::int total,
          count(*) filter (where result in ('recognized_first', 'recognized_repeat', 'suspicious'))::int recognized,
          count(*) filter (where result = 'invalid')::int invalid,
          count(*) filter (where result = 'recognized_repeat')::int repeat,
          count(*) filter (where result = 'suspicious')::int suspicious
        from public.verification_events
        where channel = 'customer' and created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')`)
      : Promise.resolve({ rows: [{ total: 0, recognized: 0, invalid: 0, repeat: 0, suspicious: 0 }] }),
    pool.query(`select to_char(d, 'YYYY-MM-DD') as day,
        count(e.id) filter (where e.result in ('recognized_first', 'recognized_repeat'))::int recognized,
        count(e.id) filter (where e.result = 'suspicious')::int suspicious,
        count(e.id) filter (where e.result = 'invalid')::int invalid,
        count(e.id) filter (where e.result in ('revoked', 'recalled', 'quarantined', 'not_released', 'retired'))::int flagged
      from generate_series((now() at time zone 'UTC')::date - 13, (now() at time zone 'UTC')::date, interval '1 day') d
      left join public.verification_events e
        on e.channel = 'customer' and e.created_at >= (d at time zone 'UTC') and e.created_at < ((d + interval '1 day') at time zone 'UTC')
      group by d order by d`),
    pool.query(`select b.id, b.batch_code as code, p.name as product, b.expected_quantity as expected, b.release_status as "releaseStatus",
        count(u.id)::int registered,
        count(u.id) filter (where u.label_status in ('issued', 'printed', 'applied'))::int labelled,
        count(u.id) filter (where u.label_status = 'applied')::int applied,
        count(u.id) filter (where u.lifecycle_status = 'released')::int released
      from public.manufacturing_batches b join public.products p on p.id = b.product_id
      left join public.part_units u on u.batch_id = b.id
      where b.processing_status in ('planned', 'in_production') or b.release_status in ('pending', 'qc_hold')
      group by b.id, p.name order by b.created_at desc limit 5`),
    canInv ? pool.query(`select count(*)::int open, count(*) filter (where severity = 'high')::int high from public.investigations where status in ('open', 'in_review')`) : Promise.resolve(null),
    canLabels
      ? pool.query(`select j.id, b.batch_code as "batchCode", j.state, j.units_done as done, j.requested_quantity as requested, j.kind, j.created_at as "createdAt"
          from public.label_jobs j join public.manufacturing_batches b on b.id = j.batch_id order by j.created_at desc limit 5`)
      : Promise.resolve({ rows: [] }),
    canScans
      ? pool.query(`select e.id, e.result, e.created_at as at, u.serial_number as serial, e.country, e.unit_id as "unitId"
          from public.verification_events e left join public.part_units u on u.id = e.unit_id
          where e.channel = 'customer' order by e.id desc limit 8`)
      : Promise.resolve(null),
    canAudit ? pool.query(`select id, action, actor_email as actor, created_at as at, target_type || ' ' || coalesce(target_id, '') as target from public.audit_logs order by id desc limit 6`) : Promise.resolve(null),
  ]);

  return {
    units: units.rows[0],
    today: today.rows[0],
    openInvestigations: inv ? inv.rows[0] : null,
    series: series.rows,
    batches: batches.rows,
    jobs: jobs.rows,
    recentScans: scans ? scans.rows : null,
    recentAudit: audit ? audit.rows : null,
  };
}
