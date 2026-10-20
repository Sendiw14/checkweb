import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, Boxes, CircleAlert, Eye, History, PackageCheck, Plus, QrCode, ScanLine, ShieldAlert } from "lucide-react";
import { ActivityChart } from "@/components/admin/activity-chart";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { StatusBadge } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { getDashboard } from "@/server/repos/dashboard";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const staff = await requirePermission("dashboard.view", { next: "/admin/dashboard" });
  const d = await getDashboard(staff);
  const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What's registered, what's out in the world, and what needs a person."
        actions={
          <>
            {can(staff.role, "batches.write") ? <Button asChild variant="secondary"><Link href="/admin/batches"><Plus aria-hidden />Register a batch</Link></Button> : null}
            {can(staff.role, "labels.generate") ? <Button asChild><Link href="/admin/labels"><QrCode aria-hidden />Generate labels</Link></Button> : null}
          </>
        }
      />

      <section aria-label="Key figures" className="dashboard-metrics grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat variant="primary" label="Registered units" value={d.units.total} icon={<Boxes />} hint="Serialized parts in the catalogue" />
        <Stat variant="primary" label="Released to market" value={d.units.released} icon={<PackageCheck />} tone="success" hint={`${pct(d.units.released, d.units.total)}% of registered units`} />
        <Stat variant="primary" label="Checks today" value={d.today.total} icon={<ScanLine />} tone="brand" hint={`${formatNumber(d.today.recognized)} recognized · ${formatNumber(d.today.repeat)} seen before`} />
        {d.openInvestigations ? (
          <Stat variant="primary" label="Open investigations" value={d.openInvestigations.open} icon={<ShieldAlert />} tone={d.openInvestigations.high ? "danger" : d.openInvestigations.open ? "warning" : "neutral"} hint={d.openInvestigations.high ? `${d.openInvestigations.high} high-priority cases` : "No high-priority cases"} href="/admin/investigations" />
        ) : (
          <Stat variant="primary" label="Unusual patterns today" value={d.today.suspicious} icon={<Eye />} hint="Flagged by the verification rules" />
        )}
      </section>

      <section aria-label="Additional indicators" className="dashboard-secondary-metrics mt-3 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Pending / on hold" value={d.units.pending + d.units.quarantined} icon={<History />} hint={`${formatNumber(d.units.pending)} in process · ${formatNumber(d.units.quarantined)} quarantined`} tone={d.units.quarantined ? "warning" : "neutral"} />
        <Stat label="Invalid codes today" value={d.today.invalid} icon={<CircleAlert />} tone={d.today.invalid > 10 ? "danger" : "neutral"} hint="Codes not found in company records" />
      </section>

      <div className="dashboard-insights mt-8 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] xl:items-start">
        <Card className="dashboard-panel dashboard-chart-panel overflow-hidden">
          <CardHeader className="border-b border-line/70 bg-white/70 px-5 pb-4 pt-5 sm:px-6">
            <CardTitle as="h2">Verification activity</CardTitle>
            <CardDescription>Public scans and manual entries. Staff QC scans are never counted here.</CardDescription>
          </CardHeader>
          <CardContent><ActivityChart data={d.series} /></CardContent>
        </Card>

        <Card className="dashboard-panel dashboard-batches-panel overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3 border-b border-line/70 bg-white/70 px-5 pb-4 pt-5 sm:px-6">
            <div><CardTitle as="h2">Production in motion</CardTitle><CardDescription>Registered → labelled → applied → released</CardDescription></div>
            {can(staff.role, "batches.read") ? <Button asChild variant="link" className="text-small"><Link href="/admin/batches">All<ArrowRight aria-hidden /></Link></Button> : null}
          </CardHeader>
          <CardContent className="grid gap-5">
            {d.batches.length === 0 ? <EmptyState icon={<Boxes />} title="No batches in progress" description="Register a batch to start serializing parts." className="py-8" /> : null}
            {d.batches.map((b) => (
              <div key={b.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/admin/batches/${b.id}`} className="min-w-0 truncate text-small font-semibold text-ink hover:text-brand">{b.code}</Link>
                  <StatusBadge kind="batchRelease" value={b.releaseStatus} />
                </div>
                <p className="mt-0.5 truncate text-caption text-quiet">{b.product}</p>
                <Progress className="mt-2.5" value={b.applied} max={Math.max(b.expected, 1)} label={`${b.code}: ${b.applied} of ${b.expected} labels applied`} />
                <p className="tabular mt-1.5 text-caption text-quiet">{formatNumber(b.registered)} registered · {formatNumber(b.labelled)} labelled · {formatNumber(b.applied)} applied · {formatNumber(b.released)} released of {formatNumber(b.expected)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="dashboard-activity-grid mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {d.recentScans ? (
          <Card className="xl:col-span-1">
            <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle as="h2">Recent verification events</CardTitle><CardDescription>Latest customer outcomes, newest first</CardDescription></div><Button asChild variant="link" className="text-small"><Link href="/admin/scans">All<ArrowRight aria-hidden /></Link></Button></CardHeader>
            <CardContent>
              {d.recentScans.length === 0 ? <EmptyState icon={<Activity />} title="No checks yet" description="Scans will appear here as customers verify parts." className="py-8" /> : (
                <ul className="divide-y divide-line">
                  {d.recentScans.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">{s.unitId ? <Link href={`/admin/part-units/${s.unitId}`} className="text-serial text-ink hover:text-brand">{s.serial}</Link> : <span className="text-small text-quiet">Unknown code</span>}<p className="text-caption text-quiet">{formatDateTime(s.at)}{s.country ? ` · ${s.country}` : ""}</p></div>
                      <StatusBadge kind="result" value={s.result} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {can(staff.role, "labels.read") ? (
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle as="h2">Label jobs</CardTitle><CardDescription>Print-ready PDF generation</CardDescription></div><Button asChild variant="link" className="text-small"><Link href="/admin/labels">All<ArrowRight aria-hidden /></Link></Button></CardHeader>
            <CardContent>
              {d.jobs.length === 0 ? <EmptyState icon={<QrCode />} title="No label jobs yet" description="Generate labels for a batch to see progress here." className="py-8" /> : (
                <ul className="divide-y divide-line">
                  {d.jobs.map((j) => (
                    <li key={j.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-3"><Link href={`/admin/label-jobs/${j.id}`} className="min-w-0 truncate text-small font-semibold text-ink hover:text-brand">{j.batchCode}</Link><StatusBadge kind="job" value={j.state} /></div>
                      <p className="tabular text-caption text-quiet">{j.kind === "reissue" ? "Reissue" : "Issue"} · {formatNumber(j.done)} of {formatNumber(j.requested)} · {formatDateTime(j.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {d.recentAudit ? (
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle as="h2">Recent staff activity</CardTitle><CardDescription>From the audit log</CardDescription></div><Button asChild variant="link" className="text-small"><Link href="/admin/audit">All<ArrowRight aria-hidden /></Link></Button></CardHeader>
            <CardContent>
              {d.recentAudit.length === 0 ? <EmptyState icon={<History />} title="Nothing logged yet" className="py-8" /> : (
                <ul className="divide-y divide-line">
                  {d.recentAudit.map((a) => (
                    <li key={a.id} className="py-2.5"><p className="truncate font-mono text-small text-ink">{a.action}</p><p className="truncate text-caption text-quiet">{a.actor ?? "system"} · {formatDateTime(a.at)}</p></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
