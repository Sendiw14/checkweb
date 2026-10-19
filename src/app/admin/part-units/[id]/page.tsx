import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Eye, KeyRound, Printer, ShieldCheck, Truck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status";
import { UnitActions } from "@/components/admin/unit-actions";
import { ProductThumb } from "@/components/admin/product-thumb";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { getUnit, unitEvents, unitLabelEvents, unitSignals, unitTokens } from "@/server/repos/units";
import { productImageUrl } from "@/server/storage/images";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Part unit" };

const RISK_TEXT: Record<string, string> = { rapid_repeat: "Many checks in a short time", many_networks: "Checked from several networks", many_countries: "Checked from several countries", high_lifetime: "Unusually many checks overall", revoked_scans: "Withdrawn code presented repeatedly" };

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission("units.read");
  const { id } = await params;
  const u = await getUnit(id);
  if (!u) notFound();
  const canScans = can(staff.role, "scans.read");
  const canSignals = can(staff.role, "security.signals");
  const [tokens, labelEvents, events, signals] = await Promise.all([
    unitTokens(id), can(staff.role, "labels.read") ? unitLabelEvents(id) : Promise.resolve(null), canScans ? unitEvents(id) : Promise.resolve(null), canSignals ? unitSignals(id) : Promise.resolve(null),
  ]);
  const active = tokens.find((t) => t.status === "active");
  const openInv = signals?.investigations.find((i) => ["open", "in_review"].includes(i.status));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Part units", href: "/admin/part-units" }, { label: u.serial_number }]}
        title={<span className="font-mono">{u.serial_number}</span>}
        meta={<><ProductThumb src={productImageUrl(u.image_path)} className="size-7" /><Link href={`/admin/products/${u.product_id}`} className="text-small font-medium text-body hover:text-brand">{u.product_name}</Link><span className="text-quiet">·</span><Link href={`/admin/batches/${u.batch_id}`} className="text-serial text-body hover:text-brand">{u.batch_code}</Link></>}
        actions={<UnitActions unitId={id} serial={u.serial_number} lifecycle={u.lifecycle_status} hasActiveToken={!!active} can={{ reissue: can(staff.role, "labels.reissue"), quarantine: can(staff.role, "batches.quarantine"), retire: can(staff.role, "units.retire"), confirmLabels: can(staff.role, "labels.confirm") }} />}
      />

      {signals?.recalls.length ? <Alert tone="danger" title="An active recall covers this unit" className="mb-6">{signals.recalls.map((r) => <Link key={r.id} href={`/admin/recalls/${r.id}`} className="mr-3 font-medium underline underline-offset-4">{r.reference}: {r.title}</Link>)}</Alert> : null}
      {u.lifecycle_status === "quarantined" ? <Alert tone="warning" title="Quarantined" className="mb-6">{u.quarantine_reason ?? "On hold"} · since {formatDateTime(u.quarantined_at)}</Alert> : null}
      {u.lifecycle_status === "retired" ? <Alert tone="info" title="Retired" className="mb-6">{u.retired_reason ?? "Withdrawn from service"} · {formatDateTime(u.retired_at)}</Alert> : null}

      <section aria-label="Status summary" className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Truck, title: "Lifecycle", note: "Where the part is in manufacturing and stock", badge: <StatusBadge kind="lifecycle" value={u.lifecycle_status} />, extra: u.released_at ? `Released ${formatDateTime(u.released_at)}` : u.qc_passed_at ? `QC passed ${formatDateTime(u.qc_passed_at)}` : "Not yet through QC" },
          { icon: Printer, title: "Label", note: "Physical label progress. “Applied” is confirmed by a person", badge: <StatusBadge kind="label" value={u.label_status} />, extra: tokens.length > 1 ? `${tokens.length - 1} earlier code${tokens.length === 2 ? "" : "s"} replaced or revoked` : "Original label" },
          { icon: KeyRound, title: "Code", note: "Whether customers can verify this unit", badge: active ? <StatusBadge kind="token" value="active" /> : <StatusBadge kind="token" value={tokens[0]?.status ?? "revoked"} />, extra: active ? `Issued ${formatDateTime(active.issued_at)}` : tokens.length ? "No working code. Issue a replacement" : "No code issued yet" },
          { icon: Eye, title: "Verification risk", note: "Signals from customer checks. Not proof of anything", badge: canSignals ? (openInv ? <Badge tone={openInv.severity === "high" ? "danger" : "warning"}>Investigation {openInv.status.replace("_", " ")}</Badge> : <Badge tone="success">No flags</Badge>) : <Badge>Not visible to your role</Badge>, extra: canSignals && signals ? `${formatNumber(signals.stats.customer_events)} customer check${signals.stats.customer_events === 1 ? "" : "s"}` : "" },
        ].map((c) => (
          <Card key={c.title} className="p-4">
            <div className="flex items-center gap-2 text-small font-semibold text-ink"><c.icon aria-hidden className="size-4 text-quiet" />{c.title}</div>
            <div className="mt-3">{c.badge}</div>
            <p className="mt-2 text-caption text-quiet">{c.extra}</p>
            <p className="mt-1 text-caption text-quiet/90">{c.note}</p>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Codes</CardTitle><CardDescription>Credential history. The code itself is never stored or shown, only a one-way fingerprint exists.</CardDescription></CardHeader>
          <CardContent>
            {tokens.length === 0 ? <p className="text-small text-quiet">No code has been issued for this unit.</p> : (
              <ul className="divide-y divide-line">
                {tokens.map((t) => (
                  <li key={t.id} className="py-3">
                    <div className="flex items-center justify-between gap-3"><span className="text-small font-medium text-ink">Issued {formatDateTime(t.issued_at)}</span><StatusBadge kind="token" value={t.status} /></div>
                    <p className="text-caption text-quiet">{t.issued_by_email ? `by ${t.issued_by_email}` : "by the system"}{t.label_job_id && can(staff.role, "labels.read") ? <> · <Link className="text-brand hover:underline" href={`/admin/label-jobs/${t.label_job_id}`}>label job</Link></> : null}</p>
                    {t.revoked_at ? <p className="mt-1 text-caption text-body">{t.status === "replaced" ? "Replaced" : "Revoked"} {formatDateTime(t.revoked_at)}: {t.revocation_reason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {labelEvents ? (
          <Card>
            <CardHeader><CardTitle as="h2">Label timeline</CardTitle><CardDescription>Issuance, printing and confirmation events</CardDescription></CardHeader>
            <CardContent>
              {labelEvents.length === 0 ? <p className="text-small text-quiet">No label events yet.</p> : (
                <ol className="relative grid gap-4 border-l border-line pl-5">
                  {labelEvents.map((e) => (
                    <li key={e.id} className="relative"><span aria-hidden className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full border-2 border-white bg-brand ring-1 ring-line-strong" />
                      <p className="text-small font-medium capitalize text-ink">{e.event_type.replace("_", " ")}</p>
                      <p className="text-caption text-quiet">{e.actor_email ?? "system"} · {formatDateTime(e.created_at)}</p>{e.note ? <p className="text-caption text-body">{e.note}</p> : null}</li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        ) : null}

        {events ? (
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle as="h2">Verification events</CardTitle><CardDescription>Latest 15. {signals ? `${formatNumber(signals.stats.networks)} distinct network${signals.stats.networks === 1 ? "" : "s"} and ${formatNumber(signals.stats.countries)} countr${signals.stats.countries === 1 ? "y" : "ies"} seen. Treat these as hints, never as proof.` : ""}</CardDescription></CardHeader>
            <CardContent>
              {events.length === 0 ? <div className="flex flex-col items-center gap-2 py-8 text-center"><Activity aria-hidden className="size-6 text-quiet" /><p className="text-small text-quiet">No checks recorded for this unit yet.</p></div> : (
                <div className="relative overflow-x-auto"><table className="w-full text-left text-small"><caption className="sr-only">Verification events for {u.serial_number}</caption>
                  <thead className="text-caption uppercase tracking-wider text-quiet"><tr><th scope="col" className="py-2 pr-4">When</th><th scope="col" className="py-2 pr-4">Outcome</th><th scope="col" className="py-2 pr-4">Channel</th><th scope="col" className="hidden py-2 pr-4 sm:table-cell">Device / place</th>{canSignals ? <th scope="col" className="hidden py-2 md:table-cell">Signals</th> : null}</tr></thead>
                  <tbody>{events.map((e) => (
                    <tr key={e.id} className="border-t border-line"><td className="whitespace-nowrap py-2.5 pr-4 text-body">{formatDateTime(e.created_at)}</td><td className="py-2.5 pr-4"><StatusBadge kind="result" value={e.result} /></td>
                      <td className="py-2.5 pr-4 capitalize text-body">{e.channel === "qc" ? "Staff QC" : e.channel}</td><td className="hidden py-2.5 pr-4 text-quiet sm:table-cell">{[e.ua_class, e.country].filter(Boolean).join(" · ") || "—"}</td>
                      {canSignals ? <td className="hidden py-2.5 text-caption text-body md:table-cell">{e.risk_reasons.length ? e.risk_reasons.map((r) => RISK_TEXT[r] ?? r).join("; ") : <span className="text-quiet">None</span>}</td> : null}</tr>
                  ))}</tbody></table></div>
              )}
              {signals?.investigations.length ? <p className="mt-4 text-small text-body">Investigations: {signals.investigations.map((i) => <Link key={i.id} className="mr-3 font-medium text-brand hover:underline" href={`/admin/investigations/${i.id}`}>{i.reference} ({i.status.replace("_", " ")})</Link>)}</p> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
      <p className="mt-6 flex items-center gap-2 text-caption text-quiet"><ShieldCheck aria-hidden className="size-3.5" />{formatNumber(u.scan_count)} customer verification{u.scan_count === 1 ? "" : "s"} counted. Staff QC checks are recorded separately and never counted.</p>
    </>
  );
}
