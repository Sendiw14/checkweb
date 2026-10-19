import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { RecallControls } from "@/components/admin/recall-controls";
import { RecallForm } from "@/components/admin/recall-form";
import { RecallScope } from "@/components/admin/recall-scope";
import { Stat } from "@/components/admin/stat";
import { StatusBadge } from "@/components/admin/status";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { getRecall, recallScope, scopeChoices } from "@/server/repos/recalls";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Recall" };

export default async function RecallPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("recalls.read");
  const { id } = await params;
  const r = await getRecall(id);
  if (!r) notFound();
  const canWrite = can(staff.role, "recalls.write");
  const canActivate = can(staff.role, "recalls.activate");
  const editable = r.status !== "closed" && canWrite;
  const [scope, choices] = await Promise.all([recallScope(id), editable ? scopeChoices() : Promise.resolve({ products: [], batches: [] })]);
  const formEditable = editable && (r.status === "draft" || canActivate);

  return (
    <>
      <PageHeader crumbs={[{ label: "Recalls", href: "/admin/recalls" }, { label: r.reference }]} title={r.title} meta={<><span className="font-mono text-small text-quiet">{r.reference}</span><StatusBadge kind="recall" value={r.status} /></>}
        actions={<RecallControls recallId={id} reference={r.reference} status={r.status} impacted={r.impacted} canActivate={canActivate} />} />
      {r.status === "active" ? <Alert tone="danger" title="This recall is live" className="mb-6">Customers who check any of the {r.impacted.toLocaleString("en-US")} covered units see the instructions below. Approved by {r.approved_by_email ?? "—"} on {formatDateTime(r.instructions_approved_at)}.</Alert> : null}
      {r.status === "draft" ? <Alert tone="info" title="Draft: not visible to customers" className="mb-6">Add the customer instructions and what the recall covers. Someone with approval rights can then activate it.</Alert> : null}
      {r.status === "closed" ? <Alert tone="success" className="mb-6">Closed {formatDateTime(r.closed_at)}. Covered units show their normal state again.</Alert> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card><CardHeader><CardTitle as="h2">Wording</CardTitle><CardDescription>Created by {r.created_by_email ?? "—"}</CardDescription></CardHeader>
          <CardContent><RecallForm mode="edit" recallId={id} status={r.status} canEdit={formEditable} initial={{ title: r.title, reason: r.reason, publicInstructions: r.public_instructions ?? "" }} /></CardContent></Card>
        <div className="grid content-start gap-6">
          <Stat label="Units covered" value={r.impacted} tone={r.status === "active" ? "danger" : "neutral"} hint="Across products, batches and listed serials" />
          <Card><CardHeader><CardTitle as="h2">What it covers</CardTitle><CardDescription>Enforced the moment the recall is active</CardDescription></CardHeader>
            <CardContent><RecallScope recallId={id} scope={scope} choices={choices} editable={editable} /></CardContent></Card>
        </div>
      </div>
    </>
  );
}
