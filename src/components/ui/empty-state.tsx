import * as React from "react";
import { cn } from "@/lib/utils";

/** Says what happened, whether anything was lost, and what to do next. */
export function EmptyState({
  icon, title, description, action, className, tone = "neutral",
}: {
  icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string; tone?: "neutral" | "danger";
}) {
  return (
    <div className={cn("app-empty-state flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {icon ? (
        <div aria-hidden className={cn("app-empty-state-icon grid size-12 place-items-center rounded-xl border [&_svg]:size-5", tone === "danger" ? "border-danger-line bg-danger-soft text-danger" : "border-line bg-cloud text-quiet")}>
          {icon}
        </div>
      ) : null}
      <div className="app-empty-state-copy max-w-sm space-y-1">
        <p className="text-subheading">{title}</p>
        {description ? <p className="text-small text-quiet">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
