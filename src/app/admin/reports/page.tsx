import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { ActivityChart } from "@/components/admin/activity-chart";
import { DateRange } from "@/components/admin/date-range";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { StatusBadge } from "@/components/admin/status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { first } from "@/server/db/sql";
import { adminActivity, holdsAndRecalls, investigationStats, jobStats, outcomeBreakdown, resolveRange, unitsByProduct, verificationSeries, weeklyTotals } from "@/server/repos/reports";
import { withParams } from "@/lib/url-state";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("reports.read");
  const sp = await searchParams;
  const range = resolveRange({ from: first(sp.from), to: first(sp.to) });
  const product = first(sp.product) && /^[0-9a-f-]{36}$/i.test(first(sp.product)!) ? first(sp.product) : undefined;
  const [series, weekly, outcomes, products, jobs, inv, holds, activity] = await Promise.all([
    verificationSeries(range, product), weeklyTotals(range, product), outcomeBreakdown(range, product), unitsByProduct(), jobStats(range), investigationStats(), holdsAndRecalls(),
    can(staff.role, "audit.read") ? adminActivity(range) : Promise.resolve(null),
  ]);
  const total = outcomes.reduce((n, o) => n + o.n, 0);
  const exportHref = (kind: string) => withParams("/api/admin/reports/export", { kind, from: range.from, to: range.to });
  const open = inv.filter((i) => ["open", "in_review"].includes(i.status)).reduce((n, i) => n + i.n, 0);

  return (
    <>
      <PageHeader title="Reports" description={`Customer verification activity and operations, ${formatDate(range.from)} to ${formatDate(range.to)} (UTC days, max 92).`}
        actions={can(staff.role, "reports.export") ? (
          <>
            {can(staff.role, "scans.read") ? <Button asChild variant="secondary"><a href={exportHref("events")} download><Download aria-hidden />Events CSV</a></Button> : null}
            {can(staff.role, "units.read") ? <Button asChild variant="secondary"><a href={exportHref("units")} download><Download aria-hidden />Units CSV</a></Button> : null}
            {can(staff.role, "audit.read") ? <Button asChild variant="secondary"><a href={exportHref("audit")} download><Download aria-hidden />Audit CSV</a></Button> : null}
          </>
        ) : null} />
      <ListToolbar showSearchless filters={[{ param: "product", label: "Product", options: products.map((p) => ({ value: p.id, label: p.name })) }]}><DateRange /></ListToolbar>

      <section aria-label="Key figures" className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Customer checks" value={total} tone="brand" hint="In the selected range" />
        <Stat label="Seen before" value={outcomes.find((o) => o.result === "recognized_repeat")?.n ?? 0} hint="Repeat checks" />
        <Stat label="Code not found" value={outcomes.find((o) => o.result === "invalid")?.n ?? 0} tone="danger" />
        <Stat label="Open investigations" value={open} tone={open ? "warning" : "neutral"} hint="Right now" href="/admin/investigations" />
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card><CardHeader><CardTitle as="h2">Daily activity</CardTitle><CardDescription>Customer checks by outcome. Staff QC and automated traffic excluded.</CardDescription></CardHeader><CardContent><ActivityChart data={series} /></CardContent></Card>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <Card><CardHeader><CardTitle as="h2">Outcomes</CardTitle></CardHeader><CardContent>
            {outcomes.length === 0 ? <p className="text-small text-quiet">No checks in this range.</p> : <table className="w-full text-small"><caption className="sr-only">Outcomes in range</caption><tbody>{outcomes.map((o) => <tr key={o.result} className="border-b border-line last:border-0"><td className="py-2.5"><StatusBadge kind="result" value={o.result} /></td><td className="tabular py-2.5 text-right font-medium text-ink">{formatNumber(o.n)}</td><td className="tabular w-14 py-2.5 text-right text-quiet">{total ? Math.round((o.n / total) * 100) : 0}%</td></tr>)}</tbody></table>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle as="h2">Weekly totals</CardTitle><CardDescription>Weeks start on Monday (UTC)</CardDescription></CardHeader><CardContent>
            {weekly.length === 0 ? <p className="text-small text-quiet">No checks in this range.</p> : <table className="w-full text-small"><caption className="sr-only">Weekly totals</caption><thead className="text-caption uppercase tracking-wider text-quiet"><tr><th scope="col" className="pb-2 text-left">Week of</th><th scope="col" className="pb-2 text-right">Checks</th><th scope="col" className="pb-2 text-right">Seen before</th><th scope="col" className="pb-2 text-right">Not found</th></tr></thead><tbody>{weekly.map((w) => <tr key={w.week} className="border-t border-line"><th scope="row" className="py-2.5 text-left font-medium text-ink">{formatDate(w.week)}</th><td className="tabular py-2.5 text-right">{formatNumber(w.total)}</td><td className="tabular py-2.5 text-right">{formatNumber(w.repeat)}</td><td className="tabular py-2.5 text-right">{formatNumber(w.invalid)}</td></tr>)}</tbody></table>}
          </CardContent></Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card><CardHeader><CardTitle as="h2">Registered units by product</CardTitle></CardHeader><CardContent className="relative overflow-x-auto">
          <table className="w-full min-w-[34rem] text-small"><caption className="sr-only">Units by product</caption><thead className="text-caption uppercase tracking-wider text-quiet"><tr><th scope="col" className="pb-2 text-left">Product</th><th scope="col" className="pb-2 text-right">Total</th><th scope="col" className="pb-2 text-right">Released</th><th scope="col" className="pb-2 text-right">In process</th><th scope="col" className="pb-2 text-right">Held</th></tr></thead>
            <tbody>{products.map((p) => <tr key={p.id} className="border-t border-line"><th scope="row" className="py-2.5 text-left font-medium"><Link href={`/admin/products/${p.id}`} className="text-ink hover:text-brand">{p.name}</Link><span className="block text-serial text-quiet">{p.sku}</span></th><td className="tabular py-2.5 text-right">{formatNumber(p.total)}</td><td className="tabular py-2.5 text-right text-success">{formatNumber(p.released)}</td><td className="tabular py-2.5 text-right">{formatNumber(p.pending)}</td><td className="tabular py-2.5 text-right">{formatNumber(p.quarantined)}</td></tr>)}</tbody></table>
        </CardContent></Card>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <Card><CardHeader><CardTitle as="h2">Label jobs</CardTitle><CardDescription>Started in the selected range</CardDescription></CardHeader><CardContent>
            {jobs.byState.length === 0 ? <p className="text-small text-quiet">No label jobs in this range.</p> : <ul className="grid gap-2.5">{jobs.byState.map((s) => <li key={s.state} className="flex items-center justify-between gap-3 text-small"><StatusBadge kind="job" value={s.state} /><span className="tabular text-body">{formatNumber(s.n)} job{s.n === 1 ? "" : "s"} · {formatNumber(s.units)} labels</span></li>)}</ul>}
            {jobs.failures.length ? <div className="mt-4 border-t border-line pt-3"><p className="text-label">Recent failures</p><ul className="mt-2 grid gap-2">{jobs.failures.map((f) => <li key={f.id} className="text-small"><Link className="font-mono text-brand hover:underline" href={`/admin/label-jobs/${f.id}`}>{f.batch_code}</Link><span className="block text-caption text-quiet">{f.error_summary}</span></li>)}</ul></div> : null}
          </CardContent></Card>
          <Card><CardHeader><CardTitle as="h2">Holds and recalls</CardTitle><CardDescription>Current state</CardDescription></CardHeader><CardContent>
            <dl className="grid gap-2.5 text-small"><div className="flex justify-between"><dt className="text-quiet">Quarantined units</dt><dd className="tabular font-medium text-ink">{formatNumber(holds.quarantinedUnits)}</dd></div><div className="flex justify-between"><dt className="text-quiet">Quarantined batches</dt><dd className="tabular font-medium text-ink">{formatNumber(holds.quarantinedBatches)}</dd></div>
              {["active", "draft", "closed"].map((s) => <div key={s} className="flex justify-between"><dt className="text-quiet">Recalls: {s}</dt><dd className="tabular font-medium text-ink">{formatNumber(holds.recalls.find((r) => r.status === s)?.n ?? 0)}</dd></div>)}</dl>
          </CardContent></Card>
          {activity ? <Card><CardHeader><CardTitle as="h2">Staff activity</CardTitle><CardDescription>Audit entries by area</CardDescription></CardHeader><CardContent>{activity.length === 0 ? <p className="text-small text-quiet">Nothing logged in this range.</p> : <ul className="grid gap-2 text-small">{activity.map((a) => <li key={a.area} className="flex justify-between"><span className="font-mono text-body">{a.area}</span><span className="tabular font-medium text-ink">{formatNumber(a.n)}</span></li>)}</ul>}</CardContent></Card> : null}
        </div>
      </div>
      <Alert tone="info" className="mt-6" title="Latency and errors">Request latency and error rates are emitted as structured logs (<span className="font-mono">verify.failed</span>, <span className="font-mono">labels.chunk_failed</span>, …) and are best viewed in your hosting provider's observability tools. They are not stored in the database, so this page can't chart them.</Alert>
    </>
  );
}
