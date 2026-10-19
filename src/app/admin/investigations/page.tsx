import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { InvestigationsTable } from "@/components/admin/investigations-table";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePermission } from "@/server/auth/guards";
import { first, pageOf } from "@/server/db/sql";
import { listInvestigations } from "@/server/repos/investigations";

export const metadata: Metadata = { title: "Investigations" };

export default async function InvestigationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("investigations.read");
  const sp = await searchParams;
  const page = pageOf(sp, 25);
  const f = { q: first(sp.q)?.trim().slice(0, 40), status: first(sp.status) ?? "active", severity: first(sp.severity), mine: first(sp.mine) };
  const { rows, total } = await listInvestigations(f, staff.userId, page);
  const filtered = !!(f.q || f.severity || f.mine || (sp.status && f.status !== "active"));

  return (
    <>
      <PageHeader title="Investigations" description="Cases where scan activity looked unusual, or a person asked for a closer look. Signals are hints, never proof: every outcome is a human decision." />
      <ListToolbar placeholder="Search case or serial" filters={[
        { param: "status", label: "Status", options: [{ value: "active", label: "Open and in review" }, { value: "open", label: "Open" }, { value: "in_review", label: "In review" }, { value: "resolved_benign", label: "Resolved: benign" }, { value: "resolved_confirmed", label: "Resolved: confirmed" }, { value: "dismissed", label: "Dismissed" }] },
        { param: "severity", label: "Severity", options: [{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }] },
        { param: "mine", label: "Assignee", options: [{ value: "1", label: "Assigned to me" }] },
      ]} />
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-white"><EmptyState icon={<ShieldCheck />} title={filtered ? "No cases match" : "Nothing needs investigating"} description={filtered ? "Try different filters." : "When scan activity trips a rule, or someone opens a case, it will appear here."} action={filtered ? <Button asChild variant="secondary"><Link href="/admin/investigations">Clear filters</Link></Button> : undefined} /></div>
        ) : (
          <InvestigationsTable rows={rows.map((r) => ({ id: r.id, reference: r.reference, severity: r.severity, status: r.status, summary: r.summary, openedAt: r.opened_at.toISOString(), assignee: r.assigned_email, unitId: r.unit_id, serial: r.serial, origin: r.origin }))} />
        )}
        <Pagination path="/admin/investigations" params={{ q: f.q, status: sp.status ? f.status : undefined, severity: f.severity, mine: f.mine }} page={page.page} pageSize={page.pageSize} total={total} />
      </div>
    </>
  );
}
