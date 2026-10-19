import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-lg border px-4 py-3.5 text-small", {
  variants: {
    tone: {
      info: "border-[#c7d9f8] bg-brand-soft text-ink",
      success: "border-success-line bg-success-soft text-ink",
      warning: "border-warning-line bg-warning-soft text-ink",
      danger: "border-danger-line bg-danger-soft text-ink",
    },
  },
  defaultVariants: { tone: "info" },
});
const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert } as const;
const iconTone = { info: "text-brand", success: "text-success", warning: "text-warning", danger: "text-danger" } as const;

export function Alert({
  className, tone = "info", title, children, action, ...props
}: Omit<React.ComponentProps<"div">, "title"> & VariantProps<typeof alertVariants> & { title?: React.ReactNode; action?: React.ReactNode }) {
  const t = tone ?? "info";
  const Icon = icons[t];
  return (
    <div role={t === "danger" || t === "warning" ? "alert" : "status"} className={cn(alertVariants({ tone }), className)} {...props}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", iconTone[t])} />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className="text-body">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
