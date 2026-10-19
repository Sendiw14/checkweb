import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { SupportTable } from "@/components/admin/support-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { first, pageOf } from "@/server/db/sql";
import { listCases } from "@/server/repos/support";
import { SUPPORT_KIND_LABELS } from "@/lib/support-schema";

export const metadata: Metadata = { title: "Support cases" };

export default async function SupportCasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("support.read");
  const sp = await searchParams;
  const page = pageOf(sp, 25);
  const f = { q: first(sp.q)?.trim().slice(0, 60), status: first(sp.status) ?? "active", kind: first(sp.kind), mine: first(sp.mine) };
  const { rows, total } = await listCases(f, staff.userId, page);
  const filtered = !!(f.q || f.kind || f.mine || (sp.status && f.status !== "active"));
  const showWho = can(staff.role, "support.manage"); // contact details only for people who work the cases

  return (
    <>
      <PageHeader title="Support cases" description="Messages from the public support form. Customer contact details are only shown to staff who handle cases." />
      <ListToolbar placeholder="Search reference, subject or serial" filters={[
        { param: "status", label: "Status", options: [{ value: "active", label: "New, open, waiting" }, { value: "new", label: "New" }, { value: "open", label: "Open" }, { value: "waiting_customer", label: "Waiting on customer" }, { value: "resolved", label: "Resolved" }, { value: "closed", label: "Closed" }] },
        { param: "kind", label: "Type", options: Object.entries(SUPPORT_KIND_LABELS).map(([value, label]) => ({ value, label })) },
        { param: "mine", label: "Assignee", options: [{ value: "1", label: "Assigned to me" }] },
      ]} />
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-white"><EmptyState icon={<LifeBuoy />} title={filtered ? "No cases match" : "No open cases"} description={filtered ? "Try different filters." : "New messages from the public support form will appear here."} action={filtered ? <Button asChild variant="secondary"><Link href="/admin/support">Clear filters</Link></Button> : undefined} /></div>
        ) : (
          <SupportTable rows={rows.map((r) => ({ id: r.id, reference: r.reference, kind: r.kind, status: r.status, subject: r.subject, createdAt: r.created_at.toISOString(), serial: r.serial_reference, assignee: r.assigned_email, who: showWho ? r.who : "Hidden for your role" }))} />
        )}
        <Pagination path="/admin/support" params={{ q: f.q, status: sp.status ? f.status : undefined, kind: f.kind, mine: f.mine }} page={page.page} pageSize={page.pageSize} total={total} />
      </div>
    </>
  );
}
