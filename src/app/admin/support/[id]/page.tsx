import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status";
import { SupportPanel } from "@/components/admin/support-panel";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { assignableStaff } from "@/server/repos/investigations";
import { getCase } from "@/server/repos/support";
import { SUPPORT_KIND_LABELS } from "@/lib/support-schema";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Support case" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("support.read");
  const { id } = await params;
  const c = await getCase(id);
  if (!c) notFound();
  const staffList = await assignableStaff();
  const seeContact = can(staff.role, "support.manage");
  const purged = !!c.purged_at;

  return (
    <>
      <PageHeader crumbs={[{ label: "Support cases", href: "/admin/support" }, { label: c.reference }]} title={c.subject} meta={<><span className="font-mono text-small text-quiet">{c.reference}</span><StatusBadge kind="support" value={c.status} /><span className="text-small text-quiet">{(SUPPORT_KIND_LABELS as Record<string, string>)[c.kind]} · received {formatDateTime(c.created_at)}</span></>} />
      {purged ? <Alert tone="info" className="mb-6" title="Personal details removed">This case was anonymised on {formatDateTime(c.purged_at)} under the retention policy.</Alert> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card><CardHeader><CardTitle as="h2">Message</CardTitle></CardHeader><CardContent><p className="whitespace-pre-line text-body">{c.message}</p></CardContent></Card>
          <Card><CardHeader><CardTitle as="h2">Contact and part</CardTitle></CardHeader>
            <CardContent>
              {!seeContact ? <p className="rounded-lg bg-cloud p-3 text-small text-quiet">Customer contact details are hidden for your role.</p> : purged ? <p className="text-small text-quiet">Removed.</p> : (
                <dl className="grid gap-3 text-small">
                  {c.contact_name ? <div className="flex justify-between gap-4"><dt className="text-quiet">Name</dt><dd className="font-medium text-ink">{c.contact_name}</dd></div> : null}
                  {c.contact_email ? <div className="flex items-center justify-between gap-4"><dt className="text-quiet">Email</dt><dd><a className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline" href={`mailto:${c.contact_email}?subject=${encodeURIComponent(`Re: ${c.reference} ${c.subject}`)}`}><Mail aria-hidden className="size-3.5" />{c.contact_email}</a></dd></div> : null}
                  {c.contact_phone ? <div className="flex items-center justify-between gap-4"><dt className="text-quiet">Phone</dt><dd><a className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline" href={`tel:${c.contact_phone.replace(/[^+\d]/g, "")}`}><Phone aria-hidden className="size-3.5" />{c.contact_phone}</a></dd></div> : null}
                </dl>
              )}
              <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-small">
                <div className="flex justify-between gap-4"><dt className="text-quiet">Serial typed by customer</dt><dd className="text-serial">{c.serial_reference ?? "—"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-quiet">Matched part</dt><dd>{c.unit_id ? <Link className="text-serial text-brand hover:underline" href={`/admin/part-units/${c.unit_id}`}>{c.unit_serial}</Link> : <span className="text-quiet">Not linked</span>}{c.product_name ? <span className="text-quiet"> · {c.product_name}</span> : null}</dd></div>
                {c.investigation_id ? <div className="flex justify-between gap-4"><dt className="text-quiet">Investigation</dt><dd><Link className="inline-flex items-center gap-1 font-mono text-brand hover:underline" href={`/admin/investigations/${c.investigation_id}`}><ShieldAlert aria-hidden className="size-3.5" />{c.investigation_ref}</Link></dd></div> : null}
              </dl>
            </CardContent></Card>
          {c.resolution ? <Card><CardHeader><CardTitle as="h2">Resolution</CardTitle></CardHeader><CardContent><p className="whitespace-pre-line text-body">{c.resolution}</p><p className="mt-2 text-caption text-quiet">{formatDateTime(c.resolved_at)}</p></CardContent></Card> : null}
        </div>
        <SupportPanel id={id} status={c.status} assignedTo={c.assigned_to} staff={staffList} meId={staff.userId} unitId={c.unit_id} canManage={can(staff.role, "support.manage")} canEscalate={can(staff.role, "investigations.manage")} resolution={c.resolution} />
      </div>
    </>
  );
}
