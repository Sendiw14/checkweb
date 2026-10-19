"use client";
import * as React from "react";
import { Progress as P } from "radix-ui";
import { cn } from "@/lib/utils";

export function Progress({ value, max = 100, className, label, tone = "brand" }: { value: number; max?: number; className?: string; label: string; tone?: "brand" | "success" | "danger" | "warning" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill = { brand: "bg-brand", success: "bg-success", danger: "bg-danger", warning: "bg-warning" }[tone];
  return (
    <P.Root value={value} max={max} aria-label={label} className={cn("relative h-2 w-full overflow-hidden rounded-full bg-subtle", className)}>
      <P.Indicator className={cn("h-full rounded-full transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]", fill)} style={{ width: `${pct}%` }} />
    </P.Root>
  );
}
