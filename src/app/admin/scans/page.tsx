import type { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { ScansTable } from "@/components/admin/scans-table";
import { Stat } from "@/components/admin/stat";
import { DateRange } from "@/components/admin/date-range";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { first, pageOf } from "@/server/db/sql";
import { listScans, scanSummary } from "@/server/repos/scans";

export const metadata: Metadata = { title: "Scan activity" };

export default async function ScansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("scans.read");
  const sp = await searchParams;
  const page = pageOf(sp, 50);
  const f = { q: first(sp.q)?.trim().slice(0, 40), result: first(sp.result), channel: first(sp.channel), from: first(sp.from), to: first(sp.to), batch: first(sp.batch), product: first(sp.product), flagged: first(sp.flagged) };
  const signals = can(staff.role, "security.signals");
  const [{ rows, total }, sum] = await Promise.all([listScans(f, page, signals), scanSummary(f)]);
  const filtered = !!(f.q || f.result || f.from || f.to || f.batch || f.product || f.flagged || (f.channel && f.channel !== "customer"));

  return (
    <>
      <PageHeader title="Scan activity" description="Every verification attempt, newest first. Customer checks by default; staff QC and automated traffic are kept separate." />
      <section aria-label="Summary of the filtered events" className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Events" value={sum.total} />
        <Stat label="Recognized" value={sum.recognized} tone="success" />
        <Stat label="Unusual patterns" value={sum.suspicious} tone={sum.suspicious ? "warning" : "neutral"} hint="Flagged by the rules" />
        <Stat label="Code not found" value={sum.invalid} tone={sum.invalid ? "danger" : "neutral"} />
      </section>
      <ListToolbar placeholder="Search serial (starts with)" filters={[
        { param: "result", label: "Outcome", options: [["recognized_first", "Recognized (first)"], ["recognized_repeat", "Recognized (repeat)"], ["suspicious", "Unusual pattern"], ["invalid", "Not found"], ["revoked", "Revoked"], ["recalled", "Recalled"], ["quarantined", "Quarantined"], ["not_released", "Not released"], ["retired", "Retired"]].map(([value, label]) => ({ value: value!, label: label! })) },
        { param: "channel", label: "Channel", options: [{ value: "customer", label: "Customer" }, { value: "qc", label: "Staff QC" }, { value: "automated", label: "Automated" }] },
        ...(signals ? [{ param: "flagged", label: "Signals", options: [{ value: "1", label: "Only with risk signals" }] }] : []),
      ]}><DateRange /></ListToolbar>
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-white"><EmptyState icon={<Activity />} title={filtered ? "No events match" : "No scans yet"} description={filtered ? "Try widening the date range or clearing filters." : "Events appear here as customers verify parts."} action={filtered ? <Button asChild variant="secondary"><Link href="/admin/scans">Clear filters</Link></Button> : undefined} /></div>
        ) : (
          <ScansTable showSignals={signals} rows={rows.map((s) => ({ id: s.id, result: s.result, channel: s.channel, kind: s.credential_kind, ref: s.request_id, country: s.country, ua: s.ua_class, score: s.risk_score, reasons: s.risk_reasons, at: s.created_at.toISOString(), unitId: s.unit_id, serial: s.serial, product: s.product_name, part: s.part_number, batch: s.batch_code }))} />
        )}
        <Pagination path="/admin/scans" params={{ q: f.q, result: f.result, channel: f.channel, from: f.from, to: f.to, batch: f.batch, product: f.product, flagged: f.flagged }} page={page.page} pageSize={page.pageSize} total={total} />
      </div>
    </>
  );
}
