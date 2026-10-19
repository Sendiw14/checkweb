import * as React from "react";
import { cn } from "@/lib/utils";

/** Scrolls horizontally inside its own box (never the page) and stays keyboard reachable. */
export function TableWrapper({ className, label, ...props }: React.ComponentProps<"div"> & { label: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className={cn("w-full overflow-x-auto rounded-lg", className)} {...props} />;
}
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return <table className={cn("w-full caption-bottom border-collapse text-small", className)} {...props} />;
}
export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-cloud [&_tr]:border-b [&_tr]:border-line", className)} {...props} />;
}
export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}
export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line transition-colors hover:bg-cloud data-[state=selected]:bg-brand-soft", className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th scope="col" className={cn("h-10 whitespace-nowrap px-4 text-left text-caption font-semibold uppercase tracking-wider text-quiet", className)} {...props} />;
}
export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle text-body", className)} {...props} />;
}
export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("py-3 text-caption text-quiet", className)} {...props} />;
}
