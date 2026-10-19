import type { Metadata } from "next";
import Link from "next/link";
import { Download, History } from "lucide-react";
import { AuditTable } from "@/components/admin/audit-table";
import { DateRange } from "@/components/admin/date-range";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { first, pageOf } from "@/server/db/sql";
import { auditTargetTypes, listAudit } from "@/server/repos/audit";
import { withParams } from "@/lib/url-state";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("audit.read");
  const sp = await searchParams;
  const page = pageOf(sp, 50);
  const f = { q: first(sp.q)?.trim().slice(0, 60), actor: first(sp.actor)?.trim().slice(0, 60), target: first(sp.target), from: first(sp.from), to: first(sp.to) };
  const [{ rows, total }, types] = await Promise.all([listAudit(f, page), auditTargetTypes()]);
  const filtered = !!(f.q || f.actor || f.target || f.from || f.to);
  return (
    <>
      <PageHeader title="Audit log" description="An append-only record of who did what. Entries can't be edited or deleted by anyone, including owners."
        actions={can(staff.role, "reports.export") ? <Button asChild variant="secondary"><a href={withParams("/api/admin/reports/export", { kind: "audit", from: f.from, to: f.to })} download><Download aria-hidden />Export CSV</a></Button> : null} />
      <ListToolbar placeholder="Action starts with… (e.g. batch.)" filters={[{ param: "target", label: "Target", options: types.map((t) => ({ value: t, label: t })) }]}><DateRange /></ListToolbar>
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-white"><EmptyState icon={<History />} title={filtered ? "No entries match" : "Nothing logged yet"} description={filtered ? "Try widening the dates or clearing filters." : "Actions by staff will be recorded here."} action={filtered ? <Button asChild variant="secondary"><Link href="/admin/audit">Clear filters</Link></Button> : undefined} /></div>
        ) : (
          <AuditTable rows={rows.map((r) => ({ id: r.id, at: r.created_at.toISOString(), actor: r.actor_email, role: r.actor_role, action: r.action, targetType: r.target_type, targetId: r.target_id, metadata: r.metadata, requestId: r.request_id }))} />
        )}
        <Pagination path="/admin/audit" params={{ q: f.q, actor: f.actor, target: f.target, from: f.from, to: f.to }} page={page.page} pageSize={page.pageSize} total={total} />
      </div>
    </>
  );
}
