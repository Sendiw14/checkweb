"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper } from "@/components/ui/table";
import { controlClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * mobile: how the column behaves in the phone card layout (below 640px). "title" is the card heading
 * (default: the first column), "hide" leaves it out. A column whose header is a function (an icon/sr-only
 * header) is treated as the row's action and sits beside the title.
 */
export type ColMeta = { className?: string; headClassName?: string; hideBelow?: "sm" | "md" | "lg" | "xl"; sortKey?: string; align?: "right"; mobile?: "title" | "hide" };

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

  const rows = table.getRowModel().rows;
  const columnsInfo = table.getAllLeafColumns().map((c, i) => {
    const meta = (c.columnDef.meta ?? {}) as ColMeta;
    const isAction = typeof c.columnDef.header === "function";
    return { id: c.id, i, meta, isAction, label: typeof c.columnDef.header === "string" ? c.columnDef.header : null };
  });
  const titleId = (columnsInfo.find((c) => c.meta.mobile === "title") ?? columnsInfo.find((c) => !c.isAction && c.meta.mobile !== "hide"))?.id;
  const actionIds = columnsInfo.filter((c) => c.isAction).map((c) => c.id);
  const detailCols = columnsInfo.filter((c) => c.id !== titleId && !c.isAction && c.meta.mobile !== "hide");
  const sortable = columnsInfo.filter((c) => c.meta.sortKey);

  return (
    <>
      {/* Phone layout: one card per row. Same cells as the table, so behaviour never diverges. */}
      <div className="grid gap-3 sm:hidden">
        {sortable.length ? (
          <label className="flex items-center gap-2 text-small text-quiet">
            <span className="shrink-0">Sort by</span>
            <select
              className={cn(controlClass, "h-10 pointer-coarse:h-11")}
              value={sort && sortable.some((c) => c.meta.sortKey === sort) ? `${sort}:${dir}` : ""}
              onChange={(e) => { const [k, d] = e.target.value.split(":"); if (!k) return; const next = new URLSearchParams(sp.toString()); next.set(sortParam, k); next.set(dirParam, d ?? "asc"); next.delete("page"); router.replace(`${path}?${next}`, { scroll: false }); }}
            >
              <option value="" disabled>Default order</option>
              {sortable.flatMap((c) => [[`${c.meta.sortKey}:asc`, `${c.label} (A to Z, low to high)`], [`${c.meta.sortKey}:desc`, `${c.label} (Z to A, high to low)`]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ) : null}
        <ul aria-label={caption} className="grid gap-3">
          {rows.map((row) => {
            const cells = row.getVisibleCells();
            const render = (id: string | undefined) => { const c = cells.find((x) => x.column.id === id); return c ? flexRender(c.column.columnDef.cell, c.getContext()) : null; };
            return (
              <li key={row.id} className="rounded-lg border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 text-body">{render(titleId)}</div>
                  {actionIds.length ? <div className="flex shrink-0 items-center gap-1">{actionIds.map((id) => <React.Fragment key={id}>{render(id)}</React.Fragment>)}</div> : null}
                </div>
                {detailCols.length ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3">
                    {detailCols.map((c) => (
                      <div key={c.id} className="min-w-0">
                        <dt className="text-caption text-quiet">{c.label ?? c.id}</dt>
                        <dd className="mt-0.5 break-words text-small text-body [&_.whitespace-nowrap]:whitespace-normal">{render(c.id)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

    <TableWrapper label={caption} className="border border-line bg-white max-sm:hidden">
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
          {rows.map((row) => (
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
    </>
  );
}
