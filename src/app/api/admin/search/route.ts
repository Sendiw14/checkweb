import { appPool } from "@/server/db/pool";
import { escapeLike } from "@/server/db/sql";
import { ForbiddenError, assertPermission } from "@/server/auth/guards";
import { can } from "@/server/auth/permissions";
import { hit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

type Hit = { type: "product" | "batch" | "unit" | "support" | "investigation"; id: string; title: string; subtitle: string; href: string };

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  let staff;
  try {
    staff = await assertPermission("dashboard.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: "forbidden" }, { status: 401, headers });
    throw e;
  }
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 64) ?? "";
  if (q.length < 2) return Response.json({ hits: [] }, { headers });

  const rl = await hit(`search:${staff.userId}`, 60, 120);
  if (!rl.allowed) return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfterSeconds) } });

  const like = escapeLike(q.toLowerCase());
  const prefix = `${like}%`;
  const contains = `%${like}%`;
  const pool = appPool();
  const hits: Hit[] = [];

  const jobs: Promise<void>[] = [];
  if (can(staff.role, "products.read")) {
    jobs.push(pool.query<{ id: string; sku: string; name: string; part_number: string }>(
      `select id, sku, name, part_number from public.products
       where lower(sku) like $1 or lower(part_number) like $1 or lower(name) like $2 order by sku limit 5`, [prefix, contains],
    ).then((r) => { for (const x of r.rows) hits.push({ type: "product", id: x.id, title: x.name, subtitle: `${x.sku} · ${x.part_number}`, href: `/admin/products/${x.id}` }); }));
  }
  if (can(staff.role, "batches.read")) {
    jobs.push(pool.query<{ id: string; batch_code: string; name: string }>(
      `select b.id, b.batch_code, p.name from public.manufacturing_batches b join public.products p on p.id = b.product_id
       where lower(b.batch_code) like $1 order by b.created_at desc limit 5`, [prefix],
    ).then((r) => { for (const x of r.rows) hits.push({ type: "batch", id: x.id, title: x.batch_code, subtitle: x.name, href: `/admin/batches/${x.id}` }); }));
  }
  if (can(staff.role, "units.read")) {
    jobs.push(pool.query<{ id: string; serial_number: string; name: string; lifecycle_status: string }>(
      `select u.id, u.serial_number, p.name, u.lifecycle_status from public.part_units u join public.products p on p.id = u.product_id
       where u.serial_number like $1 order by u.serial_number limit 6`, [escapeLike(q.toUpperCase()) + "%"],
    ).then((r) => { for (const x of r.rows) hits.push({ type: "unit", id: x.id, title: x.serial_number, subtitle: `${x.name} · ${x.lifecycle_status.replace("_", " ")}`, href: `/admin/part-units/${x.id}` }); }));
  }
  if (can(staff.role, "support.read")) {
    jobs.push(pool.query<{ id: string; reference: string; subject: string }>(
      `select id, reference, subject from public.support_cases where reference like $1 or lower(subject) like $2 order by created_at desc limit 4`, [escapeLike(q.toUpperCase()) + "%", contains],
    ).then((r) => { for (const x of r.rows) hits.push({ type: "support", id: x.id, title: x.reference, subtitle: x.subject, href: `/admin/support?case=${x.id}` }); }));
  }
  if (can(staff.role, "investigations.read")) {
    jobs.push(pool.query<{ id: string; reference: string; summary: string }>(
      `select id, reference, summary from public.investigations where reference like $1 order by opened_at desc limit 4`, [escapeLike(q.toUpperCase()) + "%"],
    ).then((r) => { for (const x of r.rows) hits.push({ type: "investigation", id: x.id, title: x.reference, subtitle: x.summary, href: `/admin/investigations?case=${x.id}` }); }));
  }
  await Promise.all(jobs);
  return Response.json({ hits: hits.slice(0, 16) }, { headers });
}
