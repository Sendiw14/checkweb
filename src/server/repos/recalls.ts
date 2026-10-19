import "server-only";
import { appPool } from "@/server/db/pool";

export async function listRecalls(status?: string) {
  const { rows } = await appPool().query(
    `select r.id, r.reference, r.title, r.status, r.issued_at, r.closed_at, r.created_at, r.instructions_approved_at,
       (select count(*)::int from public.recall_products rp where rp.recall_id = r.id) as products,
       (select count(*)::int from public.recall_batches rb where rb.recall_id = r.id) as batches,
       (select count(*)::int from public.recall_units ru where ru.recall_id = r.id) as units
     from public.recalls r ${status ? "where r.status = $1" : ""} order by (r.status = 'active') desc, r.created_at desc limit 100`, status ? [status] : []);
  return rows as { id: string; reference: string; title: string; status: string; issued_at: Date | null; closed_at: Date | null; created_at: Date; instructions_approved_at: Date | null; products: number; batches: number; units: number }[];
}

export async function getRecall(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await appPool().query(
    `select r.*, a.email as approved_by_email, c.email as created_by_email,
       (select count(*)::int from (
          select u.id from public.part_units u where u.id in (select unit_id from public.recall_units where recall_id = r.id)
          union select u.id from public.part_units u where u.batch_id in (select batch_id from public.recall_batches where recall_id = r.id)
          union select u.id from public.part_units u where u.product_id in (select product_id from public.recall_products where recall_id = r.id)) x) as impacted
     from public.recalls r left join public.admin_memberships a on a.user_id = r.instructions_approved_by left join public.admin_memberships c on c.user_id = r.created_by where r.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function recallScope(id: string) {
  const [p, b, u] = await Promise.all([
    appPool().query("select p.id, p.sku, p.name from public.recall_products rp join public.products p on p.id = rp.product_id where rp.recall_id = $1 order by p.name", [id]),
    appPool().query("select b.id, b.batch_code, p.name as product_name from public.recall_batches rb join public.manufacturing_batches b on b.id = rb.batch_id join public.products p on p.id = b.product_id where rb.recall_id = $1 order by b.batch_code", [id]),
    appPool().query("select u.id, u.serial_number from public.recall_units ru join public.part_units u on u.id = ru.unit_id where ru.recall_id = $1 order by u.serial_number limit 200", [id]),
  ]);
  return { products: p.rows as { id: string; sku: string; name: string }[], batches: b.rows as { id: string; batch_code: string; product_name: string }[], units: u.rows as { id: string; serial_number: string }[] };
}

export async function scopeChoices() {
  const [p, b] = await Promise.all([
    appPool().query("select id, sku, name from public.products order by lower(name)"),
    appPool().query("select b.id, b.batch_code, p.name as product_name from public.manufacturing_batches b join public.products p on p.id = b.product_id order by b.created_at desc limit 300"),
  ]);
  return { products: p.rows as { id: string; sku: string; name: string }[], batches: b.rows as { id: string; batch_code: string; product_name: string }[] };
}
