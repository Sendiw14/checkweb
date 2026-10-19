import type { Metadata } from "next";
import Link from "next/link";
import { Barcode } from "lucide-react";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { UnitsTable } from "@/components/admin/units-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/server/auth/guards";
import { first, pageOf } from "@/server/db/sql";
import { listUnits } from "@/server/repos/units";

export const metadata: Metadata = { title: "Part units" };

export default async function UnitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("units.read");
  const sp = await searchParams;
  const page = pageOf(sp, 50);
  const f = { q: first(sp.q)?.trim().slice(0, 40), batch: first(sp.batch), product: first(sp.product), lifecycle: first(sp.lifecycle), label: first(sp.label), sort: first(sp.sort), dir: first(sp.dir) };
  const { rows, total } = await listUnits(f, page);
  const filtered = !!(f.q || f.batch || f.product || f.lifecycle || f.label);

  return (
    <>
      <PageHeader title="Part units" description="Every physical part has one record, one serial number and, once labelled, one active code." />
      <ListToolbar placeholder="Search serial (starts with)" filters={[
        { param: "lifecycle", label: "Lifecycle", options: [{ value: "registered", label: "Registered" }, { value: "qc_passed", label: "QC passed" }, { value: "released", label: "Released" }, { value: "quarantined", label: "Quarantined" }, { value: "retired", label: "Retired" }] },
        { param: "label", label: "Label", options: [{ value: "unlabelled", label: "No label" }, { value: "issued", label: "Issued" }, { value: "printed", label: "Printed" }, { value: "applied", label: "Applied" }] },
      ]} />
      {f.batch ? <p className="mt-3 text-small text-quiet">Filtered to one batch. <Link href="/admin/part-units" className="font-medium text-brand hover:underline">Show all units</Link></p> : null}
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-white">
            <EmptyState icon={<Barcode />} title={filtered ? "No units match" : "No units yet"} description={filtered ? "Try a different serial or clear the filters." : "Units appear here once you register a batch."} action={filtered ? <Button asChild variant="secondary"><Link href="/admin/part-units">Clear filters</Link></Button> : undefined} />
          </div>
        ) : (
          <UnitsTable rows={rows.map((u) => ({ id: u.id, serial: u.serial_number, productId: u.product_id, product: u.product_name, batchId: u.batch_id, batch: u.batch_code, lifecycle: u.lifecycle_status, label: u.label_status, scans: u.scan_count, last: u.last_verified_at?.toISOString() ?? null }))} />
        )}
        <Pagination path="/admin/part-units" params={{ q: f.q, batch: f.batch, product: f.product, lifecycle: f.lifecycle, label: f.label, sort: f.sort, dir: f.dir }} page={page.page} pageSize={page.pageSize} total={total} />
      </div>
    </>
  );
}
