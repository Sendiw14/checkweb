"use client";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid, type ColMeta } from "@/components/admin/data-grid";
import { ProductThumb } from "@/components/admin/product-thumb";
import { StatusBadge } from "@/components/admin/status";
import { formatDate, formatNumber } from "@/lib/utils";

export type ProductListRow = { id: string; sku: string; part_number: string; name: string; category: string | null; imageUrl: string | null; is_active: boolean; created_at: string; batches: number; units: number };

const columns: ColumnDef<ProductListRow, unknown>[] = [
  {
    id: "name", header: "Product", meta: { sortKey: "name" } satisfies ColMeta,
    cell: ({ row: { original: p } }) => (
      <div className="flex min-w-0 items-center gap-3">
        <ProductThumb src={p.imageUrl} />
        <div className="min-w-0">
          <Link href={`/admin/products/${p.id}`} className="block max-w-72 truncate font-semibold text-ink hover:text-brand">{p.name}</Link>
          <p className="text-serial text-quiet">{p.sku}</p>
        </div>
      </div>
    ),
  },
  { id: "part", header: "Part no.", meta: { sortKey: "part", hideBelow: "md" } satisfies ColMeta, cell: ({ row }) => <span className="text-serial text-body">{row.original.part_number}</span> },
  { id: "category", header: "Category", meta: { hideBelow: "lg" } satisfies ColMeta, cell: ({ row }) => row.original.category ?? <span className="text-quiet">—</span> },
  { id: "batches", header: "Batches", meta: { sortKey: "batches", align: "right", hideBelow: "lg" } satisfies ColMeta, cell: ({ row }) => formatNumber(row.original.batches) },
  { id: "units", header: "Units", meta: { sortKey: "units", align: "right", hideBelow: "sm" } satisfies ColMeta, cell: ({ row }) => formatNumber(row.original.units) },
  { id: "status", header: "Status", cell: ({ row }) => <StatusBadge kind="active" value={row.original.is_active} /> },
  { id: "created", header: "Created", meta: { sortKey: "created", hideBelow: "xl" } satisfies ColMeta, cell: ({ row }) => <span className="whitespace-nowrap text-quiet">{formatDate(row.original.created_at)}</span> },
];

export function ProductsTable({ rows }: { rows: ProductListRow[] }) {
  return <DataGrid data={rows} columns={columns} caption="Products" />;
}
