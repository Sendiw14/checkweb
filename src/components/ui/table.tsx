import * as React from "react";
import { cn } from "@/lib/utils";

/** Scrolls horizontally inside its own box (never the page) and stays keyboard reachable. */
export function TableWrapper({ className, label, ...props }: React.ComponentProps<"div"> & { label: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className={cn("app-table-wrap relative w-full overflow-x-auto rounded-xl", className)} {...props} />;
}
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("app-table w-full caption-bottom border-collapse text-small", className)} {...props} />;
}
export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("app-table-header bg-cloud [&_tr]:border-b [&_tr]:border-line", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("app-table-row border-b border-line transition-colors hover:bg-cloud data-[state=selected]:bg-brand-soft", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th scope="col" className={cn("app-table-head h-11 whitespace-nowrap px-4 text-left text-caption font-semibold uppercase tracking-[0.1em] text-quiet", className)} {...props} />;
}
export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("app-table-cell px-4 py-3.5 align-middle text-body", className)} {...props} />;
}
export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("py-3 text-caption text-quiet", className)} {...props} />;
}
