import type { Metadata } from "next";
import Link from "next/link";
import { Plus, QrCode, ScanSearch } from "lucide-react";
import { JobsTable } from "@/components/admin/jobs-table";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { QcCheck } from "@/components/admin/qc-check";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { first, pageOf } from "@/server/db/sql";
import { listJobs } from "@/server/repos/labels";

export const metadata: Metadata = { title: "QR labels" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("labels.read");
  const sp = await searchParams;
  const page = pageOf(sp, 15);
  const f = { state: first(sp.state), batch: first(sp.batch) };
  const { rows, total } = await listJobs(f, page);

  return (
    <>
      <PageHeader title="QR labels" description="Issue secret codes for a batch, print the sheets, then confirm what was printed and applied."
        actions={can(staff.role, "labels.generate") ? <Button asChild><Link href="/admin/labels/new"><Plus aria-hidden />Generate labels</Link></Button> : null} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <ListToolbar showSearchless filters={[{ param: "state", label: "State", options: ["queued", "running", "completed", "failed", "cancelled"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })) }]} />
          <div className="mt-4">
            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line-strong bg-white"><EmptyState icon={<QrCode />} title={f.state ? "No jobs in that state" : "No label jobs yet"} description={f.state ? "Clear the filter to see every job." : "Generate labels for a batch to see its progress and files here."} action={can(staff.role, "labels.generate") ? <Button asChild><Link href="/admin/labels/new"><Plus aria-hidden />Generate labels</Link></Button> : undefined} /></div>
            ) : (
              <JobsTable rows={rows.map((j) => ({ id: j.id, kind: j.kind, state: j.state, requested: j.requested_quantity, done: j.units_done, createdAt: j.created_at.toISOString(), expiresAt: j.artifact_expires_at?.toISOString() ?? null, batch: j.batch_code, batchId: j.batch_id, by: j.created_by_email, liveParts: j.live_parts, error: j.error_summary }))} />
            )}
            <Pagination path="/admin/labels" params={{ state: f.state, batch: f.batch }} page={page.page} pageSize={page.pageSize} total={total} />
          </div>
        </div>
        {can(staff.role, "qc.verify") ? (
          <Card className="self-start">
            <CardHeader><CardTitle as="h2" className="flex items-center gap-2"><ScanSearch aria-hidden className="size-4 text-brand" />QC label check</CardTitle><CardDescription>Test a printed label without it counting as a customer.</CardDescription></CardHeader>
            <CardContent><QcCheck /></CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
