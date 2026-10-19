"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid, type ColMeta } from "@/components/admin/data-grid";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/utils";

export type AuditRow = { id: number; at: string; actor: string | null; role: string | null; action: string; targetType: string | null; targetId: string | null; metadata: Record<string, unknown>; requestId: string | null };

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [open, setOpen] = React.useState<AuditRow | null>(null);
  const columns = React.useMemo<ColumnDef<AuditRow, unknown>[]>(() => [
    { id: "at", header: "When", cell: ({ row }) => <span className="whitespace-nowrap text-body">{formatDateTime(row.original.at)}</span> },
    { id: "action", header: "Action", cell: ({ row }) => <span className="font-mono text-small text-ink">{row.original.action}</span> },
    { id: "actor", header: "Who", meta: { hideBelow: "md" } satisfies ColMeta, cell: ({ row }) => <span className="block max-w-52 truncate">{row.original.actor ?? <span className="text-quiet">system</span>}</span> },
    { id: "target", header: "Target", meta: { hideBelow: "lg" } satisfies ColMeta, cell: ({ row }) => row.original.targetType ? <span className="text-small text-quiet">{row.original.targetType}<span className="ml-1.5 font-mono text-caption">{row.original.targetId?.slice(0, 8)}</span></span> : "—" },
    { id: "open", header: () => <span className="sr-only">Details</span>, meta: { align: "right" } satisfies ColMeta, cell: ({ row }) => <Button variant="ghost" size="sm" onClick={() => setOpen(row.original)} aria-label={`Details of audit entry ${row.original.id}`}>Details</Button> },
  ], []);
  return (
    <>
      <DataGrid data={rows} columns={columns} caption="Audit log" dense />
      <Sheet open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <SheetContent side="right" title="Audit entry" description="Audit log entry details">
          {open ? (
            <div className="px-6 pb-8 pt-14">
              <h2 className="font-mono text-heading">{open.action}</h2>
              <dl className="mt-5 grid gap-3 text-small">
                {([["Entry", String(open.id)], ["When", formatDateTime(open.at)], ["Who", open.actor ?? "system"], ["Role", open.role ?? "—"], ["Target", open.targetType ? `${open.targetType} ${open.targetId ?? ""}` : "—"], ["Request", open.requestId ?? "—"]] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-line pb-3 last:border-0"><dt className="text-quiet">{k}</dt><dd className="break-all text-right font-medium text-ink">{v}</dd></div>)}
              </dl>
              <p className="mt-6 text-label">Recorded details</p>
              <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-line bg-cloud p-3 font-mono text-caption text-body">{Object.keys(open.metadata).length ? JSON.stringify(open.metadata, null, 2) : "None"}</pre>
              <p className="mt-3 text-caption text-quiet">Audit entries can't be edited or deleted, and the database refuses to store anything that looks like a code, password or secret.</p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
