import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

export function Stat({ label, value, hint, icon, tone = "neutral", href }: { label: string; value: number | string; hint?: React.ReactNode; icon?: React.ReactNode; tone?: "neutral" | "warning" | "danger" | "success" | "brand"; href?: string }) {
  const toneText = { neutral: "text-ink", warning: "text-warning", danger: "text-danger", success: "text-success", brand: "text-brand" }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-small font-medium text-body">{label}</p>
        {icon ? <span aria-hidden className="text-quiet [&_svg]:size-4">{icon}</span> : null}
      </div>
      <p className={cn("text-metric mt-3", toneText)}>{typeof value === "number" ? formatNumber(value) : value}</p>
      {hint ? <p className="mt-2 text-caption text-quiet">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-lg border border-line bg-white p-4 sm:p-5";
  return href ? <a href={href} className={cn(cls, "transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-md")}>{body}</a> : <div className={cls}>{body}</div>;
}
