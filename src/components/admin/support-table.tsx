"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid, type ColMeta } from "@/components/admin/data-grid";
import { StatusBadge } from "@/components/admin/status";
import { SUPPORT_KIND_LABELS } from "@/lib/support-schema";
import { formatDateTime } from "@/lib/utils";

export type CaseRow = { id: string; reference: string; kind: string; status: string; subject: string; createdAt: string; serial: string | null; assignee: string | null; who: string | null };

const columns: ColumnDef<CaseRow, unknown>[] = [
  { id: "ref", header: "Case", cell: ({ row: { original: r } }) => <div><Link href={`/admin/support/${r.id}`} className="font-mono text-small font-semibold text-ink hover:text-brand">{r.reference}</Link><p className="max-w-80 truncate text-caption text-body">{r.subject}</p></div> },
  { id: "kind", header: "Type", meta: { hideBelow: "lg" } satisfies ColMeta, cell: ({ row }) => <span className="text-small text-body">{(SUPPORT_KIND_LABELS as Record<string, string>)[row.original.kind]?.replace(/^(A |I )/, "") ?? row.original.kind}</span> },
  { id: "who", header: "From", meta: { hideBelow: "md" } satisfies ColMeta, cell: ({ row }) => row.original.who ? <span className="block max-w-40 truncate">{row.original.who}</span> : <span className="text-quiet">Hidden or removed</span> },
  { id: "status", header: "Status", cell: ({ row }) => <StatusBadge kind="support" value={row.original.status} /> },
  { id: "assignee", header: "Assigned", meta: { hideBelow: "xl" } satisfies ColMeta, cell: ({ row }) => row.original.assignee ?? <span className="text-quiet">Unassigned</span> },
  { id: "created", header: "Received", meta: { hideBelow: "sm" } satisfies ColMeta, cell: ({ row }) => <span className="whitespace-nowrap text-quiet">{formatDateTime(row.original.createdAt)}</span> },
];

export function SupportTable({ rows }: { rows: CaseRow[] }) {
  return <DataGrid data={rows} columns={columns} caption="Support cases" />;
}
