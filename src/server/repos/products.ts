import "server-only";
import { appPool } from "@/server/db/pool";
import { escapeLike, type Page } from "@/server/db/sql";

export type ProductRow = {
  id: string; sku: string; part_number: string; name: string; category: string | null; brand: string | null;
  image_path: string | null; is_active: boolean; created_at: Date; batches: number; units: number;
};

const SORTS: Record<string, string> = { sku: "p.sku", name: "lower(p.name)", part: "p.part_number", created: "p.created_at", batches: "batches", units: "units" };

export async function listProducts(f: { q?: string; status?: string; sort?: string; dir?: string }, page: Page): Promise<{ rows: ProductRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) { params.push(`${escapeLike(f.q.toLowerCase())}%`, `%${escapeLike(f.q.toLowerCase())}%`); where.push(`(lower(p.sku) like $1 or lower(p.part_number) like $1 or lower(p.name) like $2)`); }
  if (f.status === "active") where.push("p.is_active");
  if (f.status === "inactive") where.push("not p.is_active");
  const w = where.length ? `where ${where.join(" and ")}` : "";
  const order = `${SORTS[f.sort ?? ""] ?? "p.created_at"} ${f.dir === "asc" ? "asc" : "desc"}, p.id`;
  const n = params.length;
  const [rows, total] = await Promise.all([
    appPool().query<ProductRow>(
      `select p.id, p.sku, p.part_number, p.name, p.category, p.brand, p.image_path, p.is_active, p.created_at,
         (select count(*)::int from public.manufacturing_batches b where b.product_id = p.id) as batches,
         (select count(*)::int from public.part_units u where u.product_id = p.id) as units
       from public.products p ${w} order by ${order} limit $${n + 1} offset $${n + 2}`, [...params, page.pageSize, page.offset]),
    appPool().query<{ c: number }>(`select count(*)::int c from public.products p ${w}`, params),
  ]);
  return { rows: rows.rows, total: total.rows[0]!.c };
}

export async function getProduct(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await appPool().query(
    `select p.*, (select count(*)::int from public.manufacturing_batches b where b.product_id = p.id) as batches,
            (select count(*)::int from public.part_units u where u.product_id = p.id) as units,
            (select count(*)::int from public.part_units u where u.product_id = p.id and u.lifecycle_status = 'released') as released
     from public.products p where p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function productBatches(productId: string) {
  const { rows } = await appPool().query(
    `select b.id, b.batch_code, b.manufacturing_date, b.expected_quantity, b.processing_status, b.release_status,
            (select count(*)::int from public.part_units u where u.batch_id = b.id) as registered
     from public.manufacturing_batches b where b.product_id = $1 order by b.created_at desc limit 20`, [productId]);
  return rows as { id: string; batch_code: string; manufacturing_date: Date; expected_quantity: number; processing_status: string; release_status: string; registered: number }[];
}
