import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { ProductsTable } from "@/components/admin/products-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { first, pageOf } from "@/server/db/sql";
import { listProducts } from "@/server/repos/products";
import { productImageUrl } from "@/server/storage/images";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("products.read");
  const sp = await searchParams;
  const page = pageOf(sp);
  const f = { q: first(sp.q)?.trim().slice(0, 80), status: first(sp.status), sort: first(sp.sort), dir: first(sp.dir) };
  const { rows, total } = await listProducts(f, page);
  const filtered = !!(f.q || f.status);

  return (
    <>
      <PageHeader
        title="Products"
        description="The catalogue of parts you serialize. Each product can have many manufacturing batches."
        actions={can(staff.role, "products.write") ? <Button asChild><Link href="/admin/products/new"><Plus aria-hidden />New product</Link></Button> : null}
      />
      <ListToolbar placeholder="Search name, SKU or part no." filters={[{ param: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]} />
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-white">
            {filtered ? (
              <EmptyState icon={<Package />} title="No products match" description="Try a different search or clear the filters." action={<Button asChild variant="secondary"><Link href="/admin/products">Clear filters</Link></Button>} />
            ) : (
              <EmptyState icon={<Package />} title="No products yet" description="Add your first product, then register a batch to start issuing codes." action={can(staff.role, "products.write") ? <Button asChild><Link href="/admin/products/new"><Plus aria-hidden />New product</Link></Button> : undefined} />
            )}
          </div>
        ) : (
          <ProductsTable rows={rows.map((r) => ({ id: r.id, sku: r.sku, part_number: r.part_number, name: r.name, category: r.category, imageUrl: productImageUrl(r.image_path), is_active: r.is_active, created_at: r.created_at.toISOString(), batches: r.batches, units: r.units }))} />
        )}
        <Pagination path="/admin/products" params={{ q: f.q, status: f.status, sort: f.sort, dir: f.dir }} page={page.page} pageSize={page.pageSize} total={total} />
      </div>
    </>
  );
}
