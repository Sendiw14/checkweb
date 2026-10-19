import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImageCard } from "@/components/admin/product-image-card";
import { ProductStatusControl } from "@/components/admin/product-status-control";
import { Stat } from "@/components/admin/stat";
import { StatusBadge } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { getProduct, productBatches } from "@/server/repos/products";
import { productImageUrl } from "@/server/storage/images";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("products.read");
  const { id } = await params;
  const p = await getProduct(id);
  if (!p) notFound();
  const batches = await productBatches(id);
  const canWrite = can(staff.role, "products.write");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Products", href: "/admin/products" }, { label: p.name }]}
        title={p.name}
        meta={<><span className="text-serial text-quiet">{p.sku}</span><StatusBadge kind="active" value={p.is_active} /></>}
        actions={canWrite ? <ProductStatusControl productId={id} active={p.is_active} name={p.name} /> : null}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6">
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Stat label="Batches" value={p.batches} />
            <Stat label="Units" value={p.units} />
            <Stat label="Released" value={p.released} tone="success" />
          </div>
          <Card>
            <CardHeader><CardTitle as="h2">Details</CardTitle><CardDescription>{canWrite ? "Changes are recorded in the audit log." : "You can view but not edit products."}</CardDescription></CardHeader>
            <CardContent>
              <ProductForm mode="edit" productId={id} canWrite={canWrite} initial={{ sku: p.sku, partNumber: p.part_number, name: p.name, brand: p.brand ?? "", category: p.category ?? "", description: p.description ?? "" }} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div><CardTitle as="h2">Batches</CardTitle><CardDescription>Most recent 20</CardDescription></div>
              {can(staff.role, "batches.write") && p.is_active ? <Button asChild variant="secondary" size="sm"><Link href={`/admin/batches/new?product=${id}`}><Plus aria-hidden />Register batch</Link></Button> : null}
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? <EmptyState icon={<Boxes />} title="No batches yet" description={p.is_active ? "Register a batch to start serializing units of this product." : "This product is inactive, so new batches can't be registered."} className="py-8" /> : (
                <ul className="divide-y divide-line">
                  {batches.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                      <div className="min-w-0"><Link href={`/admin/batches/${b.id}`} className="font-semibold text-ink hover:text-brand">{b.batch_code}</Link><p className="tabular text-caption text-quiet">{formatDate(b.manufacturing_date)} · {formatNumber(b.registered)} of {formatNumber(b.expected_quantity)} registered</p></div>
                      <div className="flex gap-2"><StatusBadge kind="batchProcessing" value={b.processing_status} /><StatusBadge kind="batchRelease" value={b.release_status} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card><CardHeader><CardTitle as="h2">Photo</CardTitle></CardHeader><CardContent><ProductImageCard productId={id} imageUrl={productImageUrl(p.image_path)} name={p.name} canWrite={canWrite} /></CardContent></Card>
        </aside>
      </div>
    </>
  );
}
