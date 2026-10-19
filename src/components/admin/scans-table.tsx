"use client";
import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import { DataGrid, type ColMeta } from "@/components/admin/data-grid";
import { StatusBadge } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/utils";

export type ScanTableRow = { id: number; result: string; channel: string; kind: string | null; ref: string; country: string | null; ua: string | null; score: number; reasons: string[]; at: string; unitId: string | null; serial: string | null; product: string | null; part: string | null; batch: string | null };

const RISK_TEXT: Record<string, string> = { rapid_repeat: "Many checks in a short time", many_networks: "Checked from several networks", many_countries: "Checked from several countries", high_lifetime: "Unusually many checks overall", revoked_scans: "Withdrawn code presented repeatedly" };
const CHANNEL = { customer: "Customer", qc: "Staff QC", automated: "Automated" } as const;

export function ScansTable({ rows, showSignals }: { rows: ScanTableRow[]; showSignals: boolean }) {
  const [open, setOpen] = React.useState<ScanTableRow | null>(null);
  const columns = React.useMemo<ColumnDef<ScanTableRow, unknown>[]>(() => [
    { id: "at", header: "When", cell: ({ row }) => <span className="whitespace-nowrap text-body">{formatDateTime(row.original.at)}</span> },
    { id: "result", header: "Outcome", cell: ({ row }) => <StatusBadge kind="result" value={row.original.result} /> },
    { id: "serial", header: "Part", meta: { hideBelow: "sm", mobile: "title" } satisfies ColMeta, cell: ({ row: { original: s } }) => s.unitId ? <div><Link href={`/admin/part-units/${s.unitId}`} className="text-serial font-medium text-ink hover:text-brand">{s.serial}</Link><p className="max-w-52 truncate text-caption text-quiet">{s.product}</p></div> : <span className="text-quiet">No match</span> },
    { id: "channel", header: "Channel", meta: { hideBelow: "lg" } satisfies ColMeta, cell: ({ row }) => CHANNEL[row.original.channel as keyof typeof CHANNEL] ?? row.original.channel },
    { id: "where", header: "Device · place", meta: { hideBelow: "md" } satisfies ColMeta, cell: ({ row }) => <span className="text-quiet">{[row.original.ua, row.original.country].filter(Boolean).join(" · ") || "—"}</span> },
    ...(showSignals ? [{ id: "risk", header: "Signals", meta: { hideBelow: "xl" } satisfies ColMeta, cell: ({ row }: { row: { original: ScanTableRow } }) => row.original.score > 0 ? <span className="text-caption text-body">{row.original.reasons.map((r) => RISK_TEXT[r] ?? r).join("; ")}</span> : <span className="text-quiet">—</span> } as ColumnDef<ScanTableRow, unknown>] : []),
    { id: "open", header: () => <span className="sr-only">Details</span>, meta: { align: "right" } satisfies ColMeta, cell: ({ row }) => <Button variant="ghost" size="sm" onClick={() => setOpen(row.original)} aria-label={`Details of event ${row.original.id}`}>Details</Button> },
  ], [showSignals]);

  return (
    <>
      <DataGrid data={rows} columns={columns} caption="Verification events" dense />
      <Sheet open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <SheetContent side="right" title="Event details" description="Verification event details">
          {open ? (
            <div className="px-6 pb-8 pt-14">
              <h2 className="text-heading">Event {open.id}</h2>
              <div className="mt-3"><StatusBadge kind="result" value={open.result} /></div>
              <dl className="mt-6 grid gap-3 text-small">
                {([["When", formatDateTime(open.at)], ["Channel", CHANNEL[open.channel as keyof typeof CHANNEL] ?? open.channel], ["Credential used", open.kind === "code" ? "Backup code (typed)" : open.kind === "token" ? "QR code" : "—"], ["Device", open.ua ?? "—"], ["Country (coarse)", open.country ?? "—"], ["Request reference", <span key="r" className="text-serial">{open.ref.replace(/-/g, "").slice(0, 8).toUpperCase()}</span>], ["Product", open.product ? `${open.product} (${open.part})` : "—"], ["Batch", open.batch ?? "—"]] as [string, React.ReactNode][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-line pb-3 last:border-0"><dt className="text-quiet">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>
                ))}
              </dl>
              {showSignals ? (
                <div className="mt-6 rounded-lg border border-line bg-cloud p-4">
                  <p className="text-label">Risk signals</p>
                  {open.reasons.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-small text-body">{open.reasons.map((r) => <li key={r}>{RISK_TEXT[r] ?? r}</li>)}</ul> : <p className="mt-1 text-small text-quiet">No rules fired for this check.</p>}
                  <p className="mt-3 text-caption text-quiet">Signals are hints that a person should look. They are never proof of counterfeiting, and customers are not told about them.</p>
                </div>
              ) : null}
              {open.unitId ? <Button asChild variant="secondary" className="mt-6 w-full"><Link href={`/admin/part-units/${open.unitId}`}>Open the part unit<ExternalLink aria-hidden /></Link></Button> : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
