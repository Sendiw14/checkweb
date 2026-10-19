"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid, type ColMeta } from "@/components/admin/data-grid";
import { StatusBadge } from "@/components/admin/status";
import { formatDateTime, formatNumber } from "@/lib/utils";

export type UnitRow = { id: string; serial: string; productId: string; product: string; batchId: string; batch: string; lifecycle: string; label: string; scans: number; last: string | null };

const columns: ColumnDef<UnitRow, unknown>[] = [
  { id: "serial", header: "Serial", meta: { sortKey: "serial" } satisfies ColMeta, cell: ({ row: { original: u } }) => <Link href={`/admin/part-units/${u.id}`} className="text-serial font-medium text-ink hover:text-brand">{u.serial}</Link> },
  { id: "product", header: "Product", meta: { hideBelow: "md" } satisfies ColMeta, cell: ({ row: { original: u } }) => <Link href={`/admin/products/${u.productId}`} className="block max-w-56 truncate hover:text-brand">{u.product}</Link> },
  { id: "batch", header: "Batch", meta: { hideBelow: "lg" } satisfies ColMeta, cell: ({ row: { original: u } }) => <Link href={`/admin/batches/${u.batchId}`} className="text-serial hover:text-brand">{u.batch}</Link> },
  { id: "lifecycle", header: "Lifecycle", cell: ({ row }) => <StatusBadge kind="lifecycle" value={row.original.lifecycle} /> },
  { id: "label", header: "Label", meta: { hideBelow: "sm" } satisfies ColMeta, cell: ({ row }) => <StatusBadge kind="label" value={row.original.label} /> },
  { id: "scans", header: "Checks", meta: { sortKey: "scans", align: "right", hideBelow: "md" } satisfies ColMeta, cell: ({ row }) => formatNumber(row.original.scans) },
  { id: "last", header: "Last checked", meta: { sortKey: "last", hideBelow: "xl" } satisfies ColMeta, cell: ({ row }) => <span className="whitespace-nowrap text-quiet">{row.original.last ? formatDateTime(row.original.last) : "Never"}</span> },
];

export function UnitsTable({ rows }: { rows: UnitRow[] }) {
  return <DataGrid data={rows} columns={columns} caption="Part units" dense />;
}
