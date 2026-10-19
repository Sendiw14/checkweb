"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ColMeta = { className?: string; headClassName?: string; hideBelow?: "sm" | "md" | "lg" | "xl"; sortKey?: string; align?: "right" };

const hide = { sm: "max-sm:hidden", md: "max-md:hidden", lg: "max-lg:hidden", xl: "max-xl:hidden" } as const;

/**
 * Server-driven table: rows, sorting and pagination are decided by the server (so a list of
 * 10,000 units never reaches the browser); TanStack Table only renders and reports sort intent.
 */
export function DataGrid<T>({ data, columns, caption, sortParam = "sort", dirParam = "dir", dense = false }: {
  data: T[]; columns: ColumnDef<T, unknown>[]; caption: string; sortParam?: string; dirParam?: string; dense?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const sort = sp.get(sortParam);
  const dir = sp.get(dirParam) === "asc" ? "asc" : "desc";
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), manualSorting: true, manualPagination: true });

  const setSort = (key: string) => {
    const next = new URLSearchParams(sp.toString());
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    next.set(sortParam, key); next.set(dirParam, nextDir); next.delete("page");
    router.replace(`${path}?${next}`, { scroll: false });
  };

  return (
    <TableWrapper label={caption} className="border border-line bg-white">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-cloud">
              {hg.headers.map((h) => {
                const meta = (h.column.columnDef.meta ?? {}) as ColMeta;
                const active = !!meta.sortKey && sort === meta.sortKey;
                return (
                  <TableHead key={h.id} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : meta.sortKey ? "none" : undefined} className={cn(meta.hideBelow && hide[meta.hideBelow], meta.align === "right" && "text-right", meta.headClassName)}>
                    {meta.sortKey ? (
                      <button type="button" onClick={() => setSort(meta.sortKey!)} className={cn("group -mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase tracking-wider transition-colors hover:text-ink", active && "text-ink")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {active ? (dir === "asc" ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" />) : <ChevronsUpDown aria-hidden className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" />}
                        <span className="sr-only">{active ? `, sorted ${dir === "asc" ? "ascending" : "descending"}. Activate to reverse.` : ", activate to sort"}</span>
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => {
                const meta = (cell.column.columnDef.meta ?? {}) as ColMeta;
                return <TableCell key={cell.id} className={cn(dense ? "py-2" : "py-3", meta.hideBelow && hide[meta.hideBelow], meta.align === "right" && "text-right tabular", meta.className)}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrapper>
  );
}
