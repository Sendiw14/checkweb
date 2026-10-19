import "server-only";
import { appPool } from "@/server/db/pool";
import type { Page } from "@/server/db/sql";

export async function labelableBatches() {
  const { rows } = await appPool().query(
    `select b.id, b.batch_code, p.name as product_name, p.sku, b.processing_status, b.release_status, b.expected_quantity,
       (select count(*)::int from public.part_units u where u.batch_id = b.id) as registered,
       (select count(*)::int from public.part_units u where u.batch_id = b.id and u.lifecycle_status <> 'retired'
          and not exists (select 1 from public.part_tokens t where t.unit_id = u.id and t.status = 'active')
          and not exists (select 1 from public.label_job_units ju join public.label_jobs j on j.id = ju.job_id where ju.unit_id = u.id and j.state in ('queued', 'running'))) as unlabelled
     from public.manufacturing_batches b join public.products p on p.id = b.product_id
     where b.processing_status <> 'cancelled' and b.release_status not in ('quarantined', 'qc_hold')
     order by b.created_at desc limit 200`);
  return (rows as { id: string; batch_code: string; product_name: string; sku: string; processing_status: string; release_status: string; expected_quantity: number; registered: number; unlabelled: number }[]).filter((b) => b.unlabelled > 0);
}

export async function listJobs(f: { state?: string; batch?: string }, page: Page) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.state) { params.push(f.state); where.push(`j.state = $${params.length}`); }
  if (f.batch && /^[0-9a-f-]{36}$/i.test(f.batch)) { params.push(f.batch); where.push(`j.batch_id = $${params.length}`); }
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const n = params.length;
  const [rows, total] = await Promise.all([
    appPool().query(
      `select j.id, j.kind, j.state, j.requested_quantity, j.units_done, j.created_at, j.finished_at, j.artifact_expires_at, j.error_summary, b.batch_code, b.id as batch_id, m.email as created_by_email,
         (select count(*)::int from public.label_job_artifacts a where a.job_id = j.id and a.deleted_at is null and a.expires_at > now()) as live_parts
       from public.label_jobs j join public.manufacturing_batches b on b.id = j.batch_id left join public.admin_memberships m on m.user_id = j.created_by ${w}
       order by j.created_at desc limit $${n + 1} offset $${n + 2}`, [...params, page.pageSize, page.offset]),
    appPool().query<{ c: number }>(`select count(*)::int c from public.label_jobs j ${w}`, params),
  ]);
  return { rows: rows.rows as { id: string; kind: string; state: string; requested_quantity: number; units_done: number; created_at: Date; finished_at: Date | null; artifact_expires_at: Date | null; error_summary: string | null; batch_code: string; batch_id: string; created_by_email: string | null; live_parts: number }[], total: total.rows[0]!.c };
}

export async function getJob(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await appPool().query(
    `select j.*, b.batch_code, p.name as product_name, p.sku, m.email as created_by_email
     from public.label_jobs j join public.manufacturing_batches b on b.id = j.batch_id join public.products p on p.id = b.product_id
     left join public.admin_memberships m on m.user_id = j.created_by where j.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function jobArtifacts(id: string) {
  const { rows } = await appPool().query(
    `select a.id, a.part_no, a.units_count, a.first_serial, a.last_serial, a.bytes, a.sha256, a.created_at, a.expires_at, a.deleted_at,
       (select count(*)::int from public.label_job_units ju join public.part_units u on u.id = ju.unit_id where ju.job_id = a.job_id and ju.part_no = a.part_no and u.label_status = 'printed') as printed,
       (select count(*)::int from public.label_job_units ju join public.part_units u on u.id = ju.unit_id where ju.job_id = a.job_id and ju.part_no = a.part_no and u.label_status = 'applied') as applied
     from public.label_job_artifacts a where a.job_id = $1 order by a.part_no`, [id]);
  return rows as { id: string; part_no: number; units_count: number; first_serial: string; last_serial: string; bytes: number; sha256: string; created_at: Date; expires_at: Date; deleted_at: Date | null; printed: number; applied: number }[];
}
