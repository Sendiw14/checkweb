import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import { BatchesTable } from "@/components/admin/batches-table";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { first, pageOf } from "@/server/db/sql";
import { listBatches } from "@/server/repos/batches";

export const metadata: Metadata = { title: "Batches" };

export default async function BatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("batches.read");
  const sp = await searchParams;
  const page = pageOf(sp);
  const f = { q: first(sp.q)?.trim().slice(0, 60), processing: first(sp.processing), release: first(sp.release), product: first(sp.product), sort: first(sp.sort), dir: first(sp.dir) };
  const { rows, total } = await listBatches(f, page);
  const filtered = !!(f.q || f.processing || f.release || f.product);
  const canWrite = can(staff.role, "batches.write");

  return (
    <>
      <PageHeader title="Batches" description="Manufacturing batches move from registration through labelling and QC to release." actions={canWrite ? <Button asChild><Link href="/admin/batches/new"><Plus aria-hidden />New batch</Link></Button> : null} />
      <ListToolbar placeholder="Search batch code" filters={[
        { param: "processing", label: "Production", options: [{ value: "planned", label: "Planned" }, { value: "in_production", label: "In production" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }] },
        { param: "release", label: "Release", options: [{ value: "pending", label: "Not released" }, { value: "qc_hold", label: "QC hold" }, { value: "released", label: "Released" }, { value: "quarantined", label: "Quarantined" }] },
      ]} />
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-white">
            <EmptyState icon={<Boxes />} title={filtered ? "No batches match" : "No batches yet"} description={filtered ? "Try a different search or clear the filters." : "A batch groups the units produced together. Register one to start issuing codes."}
              action={filtered ? <Button asChild variant="secondary"><Link href="/admin/batches">Clear filters</Link></Button> : canWrite ? <Button asChild><Link href="/admin/batches/new"><Plus aria-hidden />New batch</Link></Button> : undefined} />
          </div>
        ) : (
          <BatchesTable rows={rows.map((b) => ({ id: b.id, code: b.batch_code, productId: b.product_id, product: b.product_name, sku: b.sku, date: b.manufacturing_date.toISOString(), expected: b.expected_quantity, registered: b.registered, applied: b.applied, released: b.released, processing: b.processing_status, release: b.release_status }))} />
        )}
        <Pagination path="/admin/batches" params={{ q: f.q, processing: f.processing, release: f.release, product: f.product, sort: f.sort, dir: f.dir }} page={page.page} pageSize={page.pageSize} total={total} />
      </div>
    </>
  );
}
