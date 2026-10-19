import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, History, QrCode } from "lucide-react";
import { BatchActions } from "@/components/admin/batch-actions";
import { PageHeader } from "@/components/admin/page-header";
import { Pipeline } from "@/components/admin/pipeline";
import { StatusBadge } from "@/components/admin/status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { batchHistory, batchJobs, batchRecalls, batchStats, getBatch } from "@/server/repos/batches";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Batch" };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("batches.read");
  const { id } = await params;
  const b = await getBatch(id);
  if (!b) notFound();
  const [stats, jobs, history, recalls] = await Promise.all([batchStats(id), batchJobs(id), can(staff.role, "audit.read") ? batchHistory(id) : Promise.resolve(null), batchRecalls(id)]);
  const canLabels = can(staff.role, "labels.read");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Batches", href: "/admin/batches" }, { label: b.batch_code }]}
        title={<span className="font-mono">{b.batch_code}</span>}
        meta={<><Link href={`/admin/products/${b.product_id}`} className="text-small font-medium text-body hover:text-brand">{b.product_name}</Link><StatusBadge kind="batchProcessing" value={b.processing_status} /><StatusBadge kind="batchRelease" value={b.release_status} /></>}
        actions={<BatchActions batchId={id} code={b.batch_code} processing={b.processing_status} release={b.release_status} registered={stats.registered} expected={b.expected_quantity} registeredState={stats.registered_state} qcPassed={stats.qc_passed} eligibleRelease={stats.eligible_release} quarantined={stats.quarantined} can={{ write: can(staff.role, "batches.write"), qc: can(staff.role, "batches.qc"), release: can(staff.role, "batches.release"), quarantine: can(staff.role, "batches.quarantine") }} />}
      />

      {b.release_status === "quarantined" ? <Alert tone="warning" title="This batch is quarantined" className="mb-6">Customers who scan its units are told the part is on hold. Use “Restore from quarantine” when it is cleared.</Alert> : null}
      {b.release_status === "qc_hold" ? <Alert tone="warning" title="This batch is on QC hold" className="mb-6">It can't be released or labelled until the hold is lifted.</Alert> : null}
      {recalls.some((r) => r.status === "active") ? <Alert tone="danger" title="An active recall covers this batch" className="mb-6">{recalls.filter((r) => r.status === "active").map((r) => <Link key={r.id} href={`/admin/recalls/${r.id}`} className="mr-3 font-medium underline underline-offset-4">{r.reference}: {r.title}</Link>)}</Alert> : null}

      <section aria-labelledby="pipeline-h" className="mb-6">
        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="pipeline-h" className="text-subheading">Production pipeline</h2><p className="text-small text-quiet">Out of {formatNumber(stats.registered)} registered units. “Labels issued” only means a PDF exists; “Applied” is confirmed by a person.</p></div></div>
        <Pipeline total={stats.registered} stages={[
          { key: "registered", label: "Registered", count: stats.registered, hint: `of ${formatNumber(b.expected_quantity)} expected` },
          { key: "issued", label: "Labels issued", count: stats.issued, hint: "codes generated, PDF made" },
          { key: "printed", label: "Printed", count: stats.printed, hint: "confirmed printed" },
          { key: "applied", label: "Applied", count: stats.applied, hint: "confirmed on the part", confirmed: true },
          { key: "qc", label: "QC passed", count: stats.qc_passed, hint: "includes released" },
          { key: "released", label: "Released", count: stats.released, hint: "verifiable by customers", confirmed: true },
        ]} />
        {stats.registered < b.expected_quantity ? <p className="mt-2 text-caption text-quiet">{formatNumber(b.expected_quantity - stats.registered)} expected units are not registered yet.</p> : null}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle as="h2">Label jobs</CardTitle><CardDescription>Print-ready PDF generation for this batch</CardDescription></div>
              {can(staff.role, "labels.generate") && b.processing_status !== "cancelled" ? <Button asChild size="sm"><Link href={`/admin/labels/new?batch=${id}`}><QrCode aria-hidden />Generate labels</Link></Button> : null}</CardHeader>
            <CardContent>
              {!canLabels ? <p className="text-small text-quiet">Your role can't see label jobs.</p> : jobs.length === 0 ? <p className="text-small text-quiet">No label jobs yet.</p> : (
                <ul className="divide-y divide-line">
                  {jobs.map((j) => (
                    <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div><Link href={`/admin/label-jobs/${j.id}`} className="text-small font-semibold text-ink hover:text-brand">{j.kind === "reissue" ? "Reissue" : "Issue"} · {formatNumber(j.units_done)} of {formatNumber(j.requested_quantity)}</Link><p className="text-caption text-quiet">{formatDateTime(j.created_at)}</p></div>
                      <StatusBadge kind="job" value={j.state} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {history ? (
            <Card>
              <CardHeader><CardTitle as="h2">History</CardTitle><CardDescription>Recent changes to this batch</CardDescription></CardHeader>
              <CardContent>
                {history.length === 0 ? <p className="text-small text-quiet">Nothing recorded yet.</p> : (
                  <ol className="relative grid gap-4 border-l border-line pl-5">
                    {history.map((h) => (
                      <li key={h.id} className="relative">
                        <span aria-hidden className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-white bg-brand ring-1 ring-line-strong" />
                        <p className="font-mono text-small text-ink">{h.action}</p>
                        <p className="text-caption text-quiet">{h.actor_email ?? "system"} · {formatDateTime(h.created_at)}</p>
                        {Object.keys(h.metadata).length ? <p className="mt-0.5 break-words text-caption text-body">{Object.entries(h.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</p> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle as="h2">Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-small">
                {[["Product", <Link key="p" href={`/admin/products/${b.product_id}`} className="text-brand hover:underline">{b.product_name}</Link>], ["SKU / part no.", <span key="s" className="text-serial">{b.sku} · {b.part_number}</span>], ["Manufactured", formatDate(b.manufacturing_date)], ["Expected units", formatNumber(b.expected_quantity)], ["Approved", b.approved_at ? formatDateTime(b.approved_at) : "—"], ["Released", b.released_at ? formatDateTime(b.released_at) : "—"]].map(([k, v]) => (
                  <div key={String(k)} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"><dt className="text-quiet">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>
                ))}
              </dl>
              {b.notes ? <p className="mt-4 whitespace-pre-line rounded-lg bg-cloud p-3 text-small text-body">{b.notes}</p> : null}
              {can(staff.role, "units.read") ? <Button asChild variant="secondary" className="mt-5 w-full"><Link href={`/admin/part-units?batch=${id}`}>Browse units<ArrowRight aria-hidden /></Link></Button> : null}
            </CardContent>
          </Card>
          {recalls.length ? (
            <Card><CardHeader><CardTitle as="h2">Recalls</CardTitle><CardDescription>Covering this batch or its product</CardDescription></CardHeader>
              <CardContent><ul className="divide-y divide-line">{recalls.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-2.5"><Link href={`/admin/recalls/${r.id}`} className="min-w-0 truncate text-small font-semibold text-ink hover:text-brand">{r.reference} · {r.title}</Link><StatusBadge kind="recall" value={r.status} /></li>)}</ul></CardContent></Card>
          ) : null}
          {!history ? null : <p className="flex items-center gap-2 text-caption text-quiet"><History aria-hidden className="size-3.5" />Changes are audited. Full log under Administration → Audit log.</p>}
        </div>
      </div>
    </>
  );
}
