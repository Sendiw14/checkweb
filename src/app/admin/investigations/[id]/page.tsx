import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvestigationPanel } from "@/components/admin/investigation-panel";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { assignableStaff, getInvestigation, investigationNotes, investigationScans } from "@/server/repos/investigations";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Investigation" };

const RISK_TEXT: Record<string, string> = { rapid_repeat: "Many checks in a short time", many_networks: "Checked from several networks", many_countries: "Checked from several countries", high_lifetime: "Unusually many checks overall", revoked_scans: "Withdrawn code presented repeatedly" };

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("investigations.read");
  const { id } = await params;
  const inv = await getInvestigation(id);
  if (!inv) notFound();
  const [notes, staffList, scans] = await Promise.all([investigationNotes(id), assignableStaff(), inv.unit_id && can(staff.role, "scans.read") ? investigationScans(inv.unit_id) : Promise.resolve(null)]);
  const resolved = !["open", "in_review"].includes(inv.status);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Investigations", href: "/admin/investigations" }, { label: inv.reference }]}
        title={<span className="font-mono">{inv.reference}</span>}
        meta={<><StatusBadge kind="investigation" value={inv.status} /><StatusBadge kind="severity" value={inv.severity} /><span className="text-small text-quiet">opened {formatDateTime(inv.opened_at)}{inv.opened_by_email ? ` by ${inv.opened_by_email}` : " automatically"}</span></>}
        description={inv.summary}
      />
      {resolved ? <Alert tone={inv.status === "resolved_confirmed" ? "danger" : "success"} title={`${inv.status === "resolved_confirmed" ? "Resolved: counterfeit confirmed" : inv.status === "dismissed" ? "Dismissed" : "Resolved: benign"}`} className="mb-6"><span className="whitespace-pre-line">{inv.resolution_notes}</span><span className="mt-1 block text-caption text-quiet">{inv.resolved_by_email} · {formatDateTime(inv.resolved_at)}</span></Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader><CardTitle as="h2">What triggered it</CardTitle><CardDescription>{inv.origin === "risk_rule" ? "Raised automatically by explainable rules" : inv.origin === "manual" ? "Opened by a person" : "Opened from a support case"}</CardDescription></CardHeader>
            <CardContent>
              {inv.risk_reasons.length ? <ul className="list-disc space-y-1 pl-5 text-small text-body">{inv.risk_reasons.map((r: string) => <li key={r}>{RISK_TEXT[r] ?? r}</li>)}</ul> : <p className="text-small text-quiet">No automatic signals: this case was opened by a person.</p>}
              <dl className="mt-5 grid gap-2.5 border-t border-line pt-4 text-small">
                {inv.unit_id ? <div className="flex justify-between gap-4"><dt className="text-quiet">Part</dt><dd><Link href={`/admin/part-units/${inv.unit_id}`} className="text-serial text-brand hover:underline">{inv.serial}</Link> · {inv.product_name}</dd></div> : null}
                {inv.batch_code ? <div className="flex justify-between gap-4"><dt className="text-quiet">Batch</dt><dd className="text-serial">{inv.batch_code}</dd></div> : null}
                <div className="flex justify-between gap-4"><dt className="text-quiet">Assigned to</dt><dd>{inv.assigned_name || inv.assigned_email || "Unassigned"}</dd></div>
              </dl>
            </CardContent>
          </Card>
          {scans ? (
            <Card><CardHeader><CardTitle as="h2">Recent customer checks</CardTitle><CardDescription>Latest 10 for this part</CardDescription></CardHeader>
              <CardContent>{scans.length === 0 ? <p className="text-small text-quiet">None recorded.</p> : <ul className="divide-y divide-line">{scans.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><div><StatusBadge kind="result" value={s.result} /><p className="mt-1 text-caption text-quiet">{formatDateTime(s.created_at)} · {[s.ua_class, s.country].filter(Boolean).join(" · ") || "—"}</p></div>{can(staff.role, "security.signals") && s.risk_reasons.length ? <p className="max-w-60 text-caption text-body">{s.risk_reasons.map((r) => RISK_TEXT[r] ?? r).join("; ")}</p> : null}</li>)}</ul>}</CardContent></Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle as="h2">Notes</CardTitle></CardHeader>
            <CardContent>
              {notes.length === 0 ? <p className="text-small text-quiet">No notes yet.</p> : (
                <ol className="grid gap-4">{notes.map((n) => <li key={n.id} className="rounded-lg bg-cloud p-4"><p className="whitespace-pre-line text-small text-ink">{n.body}</p><p className="mt-2 text-caption text-quiet">{n.author_name || n.author_email || "Former staff"} · {formatDateTime(n.created_at)}</p></li>)}</ol>
              )}
            </CardContent>
          </Card>
        </div>
        <InvestigationPanel id={id} status={inv.status} assignedTo={inv.assigned_to} staff={staffList} meId={staff.userId} canManage={can(staff.role, "investigations.manage")} />
      </div>
    </>
  );
}
