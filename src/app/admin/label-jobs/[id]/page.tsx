import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { JobRunner } from "@/components/admin/job-runner";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { getJob, jobArtifacts } from "@/server/repos/labels";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Label job" };

// Module-level so the clock read is not part of the render function body.
const isPast = (d: Date) => d.getTime() < Date.now();

export default async function LabelJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ autostart?: string }> }) {
  const staff = await requirePermission("labels.read");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const job = await getJob(id);
  if (!job) notFound();
  const artifacts = await jobArtifacts(id);
  const spec = job.label_spec as Record<string, unknown>;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "QR labels", href: "/admin/labels" }, { label: `Job ${String(job.id).slice(0, 8)}` }]}
        title={<>{job.kind === "reissue" ? "Label replacement" : "Labels"} for <span className="font-mono">{job.batch_code}</span></>}
        meta={<><StatusBadge kind="job" value={job.state} /><Link href={`/admin/batches/${job.batch_id}`} className="text-small font-medium text-body hover:text-brand">{job.product_name}</Link><span className="text-small text-quiet">started {formatDateTime(job.created_at)} by {job.created_by_email ?? "system"}</span></>}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <JobRunner jobId={id} state={job.state} requested={job.requested_quantity} done={job.units_done} error={job.error_summary} autostart={sp.autostart === "1"} can={{ generate: can(staff.role, "labels.generate"), download: can(staff.role, "labels.download"), confirm: can(staff.role, "labels.confirm") }}
          parts={artifacts.map((a) => ({ partNo: a.part_no, units: a.units_count, first: a.first_serial, last: a.last_serial, bytes: Number(a.bytes), expiresAt: a.expires_at.toISOString(), deleted: !!a.deleted_at || isPast(a.expires_at), printed: a.printed, applied: a.applied }))} />
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle as="h2" className="flex items-center gap-2"><Printer aria-hidden className="size-4 text-brand" />Printing instructions</CardTitle></CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-small text-body">
                <li>Open the PDF and print at <b>Actual size / 100%</b>. Turn off “Fit to page” and “Shrink to fit”.</li>
                <li>Use the labels' recommended stock; load a test sheet first. Check the four corner ticks line up with a ruler.</li>
                <li>Before applying a full run, scan a test label with an iPhone and an Android phone, and with the QC check on the Labels page.</li>
                <li>Apply labels, then press <b>Confirm applied</b> for each file. Release depends on it.</li>
                <li>Delete the PDF from the computer afterwards. It contains live codes.</li>
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle as="h2">Settings used</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-2.5 text-small">
                {[["Paper", String(spec.page)], ["Label", `${spec.labelWidthMm} × ${spec.labelHeightMm} mm`], ["QR", `${spec.qrSizeMm} mm · EC ${spec.qrErrorCorrection}`], ["Chunk size", `${formatNumber(job.chunk_size)} labels per file`], ["Attempts", String(job.attempts)], ...(job.reason ? [["Reason", String(job.reason)]] : []), ...(job.artifact_expires_at ? [["Files expire", formatDateTime(job.artifact_expires_at)]] : [])].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4"><dt className="text-quiet">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
