"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid, type ColMeta } from "@/components/admin/data-grid";
import { StatusBadge } from "@/components/admin/status";
import { Progress } from "@/components/ui/progress";
import { formatDateTime, formatNumber } from "@/lib/utils";

export type JobRow = { id: string; kind: string; state: string; requested: number; done: number; createdAt: string; expiresAt: string | null; batch: string; batchId: string; by: string | null; liveParts: number; error: string | null };

const columns: ColumnDef<JobRow, unknown>[] = [
  { id: "batch", header: "Job", cell: ({ row: { original: j } }) => <div><Link href={`/admin/label-jobs/${j.id}`} className="font-mono text-small font-semibold text-ink hover:text-brand">{j.batch}</Link><p className="text-caption text-quiet">{j.kind === "reissue" ? "Reissue" : "Issue"} · {j.by ?? "system"}</p></div> },
  { id: "progress", header: "Progress", meta: { className: "min-w-40", hideBelow: "sm" } satisfies ColMeta, cell: ({ row: { original: j } }) => (<div><Progress value={j.done} max={Math.max(j.requested, 1)} label={`${j.done} of ${j.requested} labels generated`} className="h-1.5" tone={j.state === "failed" ? "danger" : j.state === "completed" ? "success" : "brand"} /><p className="tabular mt-1 text-caption text-quiet">{formatNumber(j.done)} of {formatNumber(j.requested)}</p></div>) },
  { id: "state", header: "State", cell: ({ row }) => <StatusBadge kind="job" value={row.original.state} /> },
  { id: "files", header: "Files", meta: { hideBelow: "lg" } satisfies ColMeta, cell: ({ row: { original: j } }) => j.liveParts > 0 ? <span className="text-small">{j.liveParts} available{j.expiresAt ? <span className="block text-caption text-quiet">until {formatDateTime(j.expiresAt)}</span> : null}</span> : <span className="text-quiet">{j.state === "completed" ? "Expired" : "—"}</span> },
  { id: "created", header: "Started", meta: { hideBelow: "md" } satisfies ColMeta, cell: ({ row }) => <span className="whitespace-nowrap text-quiet">{formatDateTime(row.original.createdAt)}</span> },
];

export function JobsTable({ rows }: { rows: JobRow[] }) {
  return <DataGrid data={rows} columns={columns} caption="Label jobs" />;
}
