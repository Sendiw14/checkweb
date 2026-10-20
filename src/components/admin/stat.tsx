import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

type StatTone = "neutral" | "warning" | "danger" | "success" | "brand";
type StatVariant = "primary" | "secondary";

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
  variant = "secondary",
}: {
  label: string;
  value: number | string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  href?: string;
  variant?: StatVariant;
}) {
  const toneText: Record<StatTone, string> = {
    neutral: "text-ink",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-success",
    brand: "text-brand",
  };
  const iconTone: Record<StatTone, string> = {
    neutral: "bg-subtle text-body",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
    brand: "bg-brand-soft text-brand",
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-small font-medium leading-snug text-body">{label}</p>
        {icon ? (
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-[18px]", iconTone[tone])} aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <p className={cn("tabular mt-4 font-semibold tracking-[-0.045em] leading-none", toneText[tone], variant === "primary" ? "text-[clamp(2rem,2.6vw,2.75rem)]" : "text-[1.75rem]")}>
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {hint ? <p className={cn("mt-2.5 text-caption leading-relaxed text-quiet", variant === "primary" && "max-w-[24rem]")}>{hint}</p> : null}
    </>
  );

  const cls = cn(
    "stat-card relative block overflow-hidden rounded-xl border border-line bg-white p-4 transition-[border-color,box-shadow,transform] duration-[var(--dur-fast)] sm:p-5",
    variant === "primary" ? "min-h-[142px] sm:min-h-[156px] sm:p-6" : "min-h-[112px]",
    href && "cursor-pointer hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_28px_-18px_rgba(23,43,77,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  );

  return href ? (
    <a href={href} data-variant={variant} data-tone={tone} className={cls}>{body}</a>
  ) : (
    <div data-variant={variant} data-tone={tone} className={cls}>{body}</div>
  );
}
