import { CheckCircle2, Circle } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

export type PipelineStage = { key: string; label: string; count: number; hint: string; confirmed?: boolean };

/**
 * Production pipeline for a batch. Each stage is a distinct, separately-confirmed fact:
 * "Labels issued" means a PDF was generated; only "Applied" means a person confirmed the label is on the part.
 */
export function Pipeline({ stages, total }: { stages: PipelineStage[]; total: number }) {
  return (
    <ol className="grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {stages.map((s, i) => {
        const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
        const complete = total > 0 && s.count >= total;
        return (
          <li key={s.key} className="bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-caption font-semibold uppercase tracking-wider text-quiet"><span className="mr-1.5 font-mono">{String(i + 1).padStart(2, "0")}</span>{s.label}</p>
              {complete ? <CheckCircle2 aria-label="Complete" className="size-4 shrink-0 text-success" /> : <Circle aria-hidden className="size-4 shrink-0 text-line-strong" />}
            </div>
            <p className="text-metric mt-3">{formatNumber(s.count)}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden><div className={cn("h-full rounded-full transition-[width] duration-[var(--dur-slow)]", s.confirmed ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} /></div>
            <p className="mt-2 text-caption text-quiet"><span className="tabular font-medium text-body">{pct}%</span> · {s.hint}</p>
          </li>
        );
      })}
    </ol>
  );
}
