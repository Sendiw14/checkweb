"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid, type ColMeta } from "@/components/admin/data-grid";
import { StatusBadge } from "@/components/admin/status";
import { formatDateTime } from "@/lib/utils";

export type InvTableRow = { id: string; reference: string; severity: string; status: string; summary: string; openedAt: string; assignee: string | null; unitId: string | null; serial: string | null; origin: string };

const columns: ColumnDef<InvTableRow, unknown>[] = [
  { id: "ref", header: "Case", cell: ({ row: { original: r } }) => <div><Link href={`/admin/investigations/${r.id}`} className="font-mono text-small font-semibold text-ink hover:text-brand">{r.reference}</Link><p className="max-w-80 truncate text-caption text-quiet">{r.summary}</p></div> },
  { id: "unit", header: "Part", meta: { hideBelow: "md" } satisfies ColMeta, cell: ({ row: { original: r } }) => r.unitId ? <Link href={`/admin/part-units/${r.unitId}`} className="text-serial hover:text-brand">{r.serial}</Link> : <span className="text-quiet">Batch-level</span> },
  { id: "sev", header: "Severity", cell: ({ row }) => <StatusBadge kind="severity" value={row.original.severity} /> },
  { id: "status", header: "Status", cell: ({ row }) => <StatusBadge kind="investigation" value={row.original.status} /> },
  { id: "who", header: "Assigned", meta: { hideBelow: "lg" } satisfies ColMeta, cell: ({ row }) => row.original.assignee ?? <span className="text-quiet">Unassigned</span> },
  { id: "opened", header: "Opened", meta: { hideBelow: "xl" } satisfies ColMeta, cell: ({ row }) => <span className="whitespace-nowrap text-quiet">{formatDateTime(row.original.openedAt)}</span> },
];

export function InvestigationsTable({ rows }: { rows: InvTableRow[] }) {
  return <DataGrid data={rows} columns={columns} caption="Investigations" />;
}
