import "server-only";
import { appPool } from "@/server/db/pool";
import { escapeLike, type Page } from "@/server/db/sql";

export type BatchListRow = {
  id: string; batch_code: string; product_id: string; product_name: string; sku: string; manufacturing_date: Date; expected_quantity: number;
  processing_status: string; release_status: string; registered: number; applied: number; released: number; created_at: Date;
};

const SORTS: Record<string, string> = { code: "lower(b.batch_code)", date: "b.manufacturing_date", created: "b.created_at", expected: "b.expected_quantity", product: "lower(p.name)" };

export async function listBatches(f: { q?: string; processing?: string; release?: string; product?: string; sort?: string; dir?: string }, page: Page) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replaceAll("?", `$${params.length}`)); };
  if (f.q) add("lower(b.batch_code) like ?", `${escapeLike(f.q.toLowerCase())}%`);
  if (f.processing) add("b.processing_status = ?", f.processing);
  if (f.release) add("b.release_status = ?", f.release);
  if (f.product && /^[0-9a-f-]{36}$/i.test(f.product)) add("b.product_id = ?", f.product);
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const order = `${SORTS[f.sort ?? ""] ?? "b.created_at"} ${f.dir === "asc" ? "asc" : "desc"}, b.id`;
  const n = params.length;
  const [rows, total] = await Promise.all([
    appPool().query<BatchListRow>(
      `select b.id, b.batch_code, b.product_id, p.name as product_name, p.sku, b.manufacturing_date, b.expected_quantity, b.processing_status, b.release_status, b.created_at,
         (select count(*)::int from public.part_units u where u.batch_id = b.id) as registered,
         (select count(*)::int from public.part_units u where u.batch_id = b.id and u.label_status = 'applied') as applied,
         (select count(*)::int from public.part_units u where u.batch_id = b.id and u.lifecycle_status = 'released') as released
       from public.manufacturing_batches b join public.products p on p.id = b.product_id ${w}
       order by ${order} limit $${n + 1} offset $${n + 2}`, [...params, page.pageSize, page.offset]),
    appPool().query<{ c: number }>(`select count(*)::int c from public.manufacturing_batches b ${w}`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0]!.c };
}

export async function getBatch(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await appPool().query(
    `select b.*, p.name as product_name, p.sku, p.part_number, p.is_active as product_active
     from public.manufacturing_batches b join public.products p on p.id = b.product_id where b.id = $1`, [id]);
  return rows[0] ?? null;
}

export type BatchStats = { eligible_release: number; registered: number; issued: number; printed: number; applied: number; qc_passed: number; released: number; quarantined: number; retired: number; registered_state: number };

export async function batchStats(id: string): Promise<BatchStats> {
  const { rows } = await appPool().query(
    `select count(*)::int registered,
       count(*) filter (where label_status <> 'unlabelled')::int issued,
       count(*) filter (where label_status in ('printed', 'applied'))::int printed,
       count(*) filter (where label_status = 'applied')::int applied,
       count(*) filter (where lifecycle_status in ('qc_passed', 'released'))::int qc_passed,
       count(*) filter (where lifecycle_status = 'released')::int released,
       count(*) filter (where lifecycle_status = 'quarantined')::int quarantined,
       count(*) filter (where lifecycle_status = 'retired')::int retired,
       count(*) filter (where lifecycle_status = 'registered')::int registered_state,
       count(*) filter (where lifecycle_status = 'qc_passed' and label_status = 'applied')::int eligible_release
     from public.part_units where batch_id = $1`, [id]);
  return rows[0];
}

export async function batchJobs(id: string) {
  const { rows } = await appPool().query(
    `select id, kind, state, requested_quantity, units_done, created_at from public.label_jobs where batch_id = $1 order by created_at desc limit 8`, [id]);
  return rows as { id: string; kind: string; state: string; requested_quantity: number; units_done: number; created_at: Date }[];
}

export async function batchHistory(id: string) {
  const { rows } = await appPool().query(
    `select id, action, actor_email, metadata, created_at from public.audit_logs where target_type = 'batch' and target_id = $1 order by id desc limit 15`, [id]);
  return rows as { id: number; action: string; actor_email: string | null; metadata: Record<string, unknown>; created_at: Date }[];
}

export async function batchRecalls(id: string) {
  const { rows } = await appPool().query(
    `select r.id, r.reference, r.title, r.status from public.recalls r
     where exists (select 1 from public.recall_batches rb where rb.recall_id = r.id and rb.batch_id = $1)
        or exists (select 1 from public.recall_products rp join public.manufacturing_batches b on b.product_id = rp.product_id where rp.recall_id = r.id and b.id = $1)
     order by r.created_at desc`, [id]);
  return rows as { id: string; reference: string; title: string; status: string }[];
}

export async function activeProducts() {
  const { rows } = await appPool().query("select id, sku, name from public.products where is_active order by lower(name)");
  return rows as { id: string; sku: string; name: string }[];
}
