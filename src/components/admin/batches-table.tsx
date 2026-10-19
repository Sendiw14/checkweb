"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid, type ColMeta } from "@/components/admin/data-grid";
import { StatusBadge } from "@/components/admin/status";
import { Progress } from "@/components/ui/progress";
import { formatDate, formatNumber } from "@/lib/utils";

export type BatchRow = { id: string; code: string; productId: string; product: string; sku: string; date: string; expected: number; registered: number; applied: number; released: number; processing: string; release: string };

const columns: ColumnDef<BatchRow, unknown>[] = [
  { id: "code", header: "Batch", meta: { sortKey: "code" } satisfies ColMeta, cell: ({ row: { original: b } }) => <Link href={`/admin/batches/${b.id}`} className="font-semibold text-ink hover:text-brand">{b.code}</Link> },
  { id: "product", header: "Product", meta: { sortKey: "product", hideBelow: "md" } satisfies ColMeta, cell: ({ row: { original: b } }) => <div className="min-w-0"><Link href={`/admin/products/${b.productId}`} className="block max-w-56 truncate hover:text-brand">{b.product}</Link><p className="text-serial text-quiet">{b.sku}</p></div> },
  { id: "date", header: "Made", meta: { sortKey: "date", hideBelow: "xl" } satisfies ColMeta, cell: ({ row }) => <span className="whitespace-nowrap text-quiet">{formatDate(row.original.date)}</span> },
  {
    id: "progress", header: "Progress", meta: { hideBelow: "sm", className: "min-w-44" } satisfies ColMeta,
    cell: ({ row: { original: b } }) => (
      <div>
        <Progress value={b.applied} max={Math.max(b.expected, 1)} label={`${b.code}: ${b.applied} of ${b.expected} labels applied`} className="h-1.5" />
        <p className="tabular mt-1.5 text-caption text-quiet">{formatNumber(b.registered)}/{formatNumber(b.expected)} registered · {formatNumber(b.applied)} applied · {formatNumber(b.released)} released</p>
      </div>
    ),
  },
  { id: "processing", header: "Production", meta: { hideBelow: "lg" } satisfies ColMeta, cell: ({ row }) => <StatusBadge kind="batchProcessing" value={row.original.processing} /> },
  { id: "release", header: "Release", cell: ({ row }) => <StatusBadge kind="batchRelease" value={row.original.release} /> },
];

export function BatchesTable({ rows }: { rows: BatchRow[] }) {
  return <DataGrid data={rows} columns={columns} caption="Manufacturing batches" />;
}
