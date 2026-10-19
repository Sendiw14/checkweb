"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Download, FileCheck2, Loader2, Play, RefreshCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/admin/status";
import { advanceLabelJob, cancelLabelJob, confirmLabels, retryLabelJob } from "@/app/admin/labels/actions";
import { formatDateTime, formatNumber } from "@/lib/utils";

export type PartRow = { partNo: number; units: number; first: string; last: string; bytes: number; expiresAt: string; deleted: boolean; printed: number; applied: number };

export function JobRunner({ jobId, state, requested, done, error, autostart, parts, can }: {
  jobId: string; state: string; requested: number; done: number; error: string | null; autostart: boolean; parts: PartRow[];
  can: { generate: boolean; download: boolean; confirm: boolean };
}) {
  const router = useRouter();
  const [live, setLive] = React.useState({ state, done, error });
  const [running, setRunning] = React.useState(false);
  const stopRef = React.useRef(false);
  const startedRef = React.useRef(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [confirming, setConfirming] = React.useState<string | null>(null);

  // Adopt fresh server props (after router.refresh()) without an effect: compare during render.
  const [seen, setSeen] = React.useState({ state, done, error });
  if (seen.state !== state || seen.done !== done || seen.error !== error) {
    setSeen({ state, done, error });
    setLive({ state, done, error });
  }

  const run = React.useCallback(async () => {
    if (running) return;
    setRunning(true); stopRef.current = false;
    let busyRetries = 0;
    for (;;) {
      if (stopRef.current) break;
      let res;
      try { res = await advanceLabelJob(jobId); } catch { toast.error("Lost contact with the server. The job is safe: press Resume to continue."); break; }
      if (!res.ok) { toast.error(res.error); break; }
      const d = res.data!;
      if (d.status === "busy") { if (++busyRetries > 20) { toast.error("Another worker is processing this job. Check back shortly."); break; } await new Promise((r) => setTimeout(r, 1500)); continue; }
      busyRetries = 0;
      setLive({ state: d.status === "progress" ? "running" : d.status, done: d.unitsDone, error: d.error ?? null });
      if (d.status !== "progress") { if (d.status === "completed") toast.success("Labels generated"); break; }
    }
    setRunning(false);
    router.refresh();
  }, [jobId, router, running]);

  React.useEffect(() => {
    if (autostart && !startedRef.current && can.generate && ["queued", "running"].includes(state)) { startedRef.current = true; void run(); }
  }, [autostart, can.generate, state, run]);

  const isActive = ["queued", "running"].includes(live.state);
  const pct = requested ? Math.round((live.done / requested) * 100) : 0;

  return (
    <div className="grid gap-6">
      <section aria-label="Progress" className="rounded-xl border border-line bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><StatusBadge kind="job" value={live.state} />{running ? <span className="flex items-center gap-1.5 text-small text-quiet"><Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />Working…</span> : null}</div>
          <p className="tabular text-small text-body" aria-live="polite"><b className="text-ink">{formatNumber(live.done)}</b> of {formatNumber(requested)} labels · {pct}%</p>
        </div>
        <Progress className="mt-4 h-2.5" value={live.done} max={Math.max(requested, 1)} label={`${live.done} of ${requested} labels generated`} tone={live.state === "failed" ? "danger" : live.state === "completed" ? "success" : "brand"} />
        {live.state === "failed" && live.error ? <Alert tone="danger" title="This job stopped" className="mt-4">{live.error}<span className="mt-1 block text-caption text-quiet">Nothing was issued for the chunk that failed, and everything before it is intact.</span></Alert> : null}
        {live.state === "cancelled" ? <Alert tone="info" className="mt-4">Cancelled after {formatNumber(live.done)} labels. Codes already issued stay valid; the remaining units are free to be labelled again in a new job.</Alert> : null}
        {live.state === "completed" ? <Alert tone="success" className="mt-4" title="All labels generated">Print the files below, apply the labels, then confirm each file as printed and applied. Units can't be released until their label is confirmed as applied.</Alert> : null}
        {can.generate ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {isActive && !running ? <Button onClick={() => void run()}><Play aria-hidden />{live.done > 0 ? "Resume" : "Start"}</Button> : null}
            {running ? <Button variant="secondary" onClick={() => { stopRef.current = true; }}><Square aria-hidden />Pause after this chunk</Button> : null}
            {live.state === "failed" ? <Button onClick={async () => { const r = await retryLabelJob(jobId); if (r.ok) { setLive((l) => ({ ...l, state: "queued", error: null })); toast.success("Job queued again"); void run(); } else toast.error(r.error); }}><RefreshCcw aria-hidden />Retry</Button> : null}
            {isActive ? <Button variant="danger-soft" onClick={() => setConfirmCancel(true)}>Cancel job</Button> : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="files-h">
        <h2 id="files-h" className="text-subheading">Print files</h2>
        <p className="mt-1 text-small text-quiet">Each file holds up to 500 labels. Confirm a file as printed, then as applied, once a person has physically done it.</p>
        {parts.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-line-strong bg-white px-4 py-8 text-center text-small text-quiet">{isActive ? "Files appear here as each chunk is generated." : "No files were generated."}</p> : (
          <ul className="mt-4 grid gap-3">
            {parts.map((p) => (
              <li key={p.partNo} className="rounded-xl border border-line bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-small font-semibold text-ink">File {p.partNo} · {formatNumber(p.units)} labels</p><p className="text-serial text-quiet">{p.first} – {p.last}</p>
                    <p className="mt-1 text-caption text-quiet">{(p.bytes / 1024).toFixed(0)} KB · {p.deleted ? "deleted" : `available until ${formatDateTime(p.expiresAt)}`}</p></div>
                  {can.download ? (p.deleted ? <span className="text-small text-quiet">Expired</span> : <Button asChild variant="secondary" size="sm"><a href={`/api/admin/label-jobs/${jobId}/download/${p.partNo}`} download><Download aria-hidden />Download PDF</a></Button>) : null}
                </div>
                <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <p className="tabular text-small text-body"><span className="text-ink">{formatNumber(p.printed + p.applied)}</span> printed · <span className="text-ink">{formatNumber(p.applied)}</span> applied of {formatNumber(p.units)}</p>
                  {can.confirm ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={p.printed + p.applied >= p.units} onClick={() => setConfirming(`${p.partNo}:printed`)}><FileCheck2 aria-hidden />Confirm printed</Button>
                      <Button size="sm" disabled={p.applied >= p.units} onClick={() => setConfirming(`${p.partNo}:applied`)}><FileCheck2 aria-hidden />Confirm applied</Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog open={confirmCancel} onOpenChange={setConfirmCancel} tone="danger" title="Cancel this job?" confirmLabel="Cancel job"
        description="No more labels will be generated. Codes already issued stay valid and their files stay available."
        onConfirm={async () => { stopRef.current = true; const r = await cancelLabelJob(jobId); if (r.ok) { toast.success("Cancellation requested"); router.refresh(); } else { toast.error(r.error); throw new Error(r.error); } }} />
      {confirming ? (() => {
        const [partStr, to] = confirming.split(":") as [string, "printed" | "applied"];
        const part = parts.find((x) => x.partNo === Number(partStr));
        return (
          <ConfirmDialog open onOpenChange={(v) => { if (!v) setConfirming(null); }} title={to === "printed" ? `Confirm file ${partStr} was printed?` : `Confirm file ${partStr} was applied?`} confirmLabel={to === "printed" ? "Yes, printed" : "Yes, applied"}
            description={to === "printed" ? <>You're confirming that all {formatNumber(part?.units ?? 0)} labels in this file were printed and checked.</> : <>You're confirming that all {formatNumber(part?.units ?? 0)} labels in this file are physically on their parts. This also marks them printed. This is what allows release, so only confirm what you have seen.</>}
            onConfirm={async () => { const r = await confirmLabels(jobId, Number(partStr), to); if (r.ok) { toast.success(`${formatNumber(r.data?.changed ?? 0)} labels marked ${to}`); router.refresh(); } else { toast.error(r.error); throw new Error(r.error); } }} />
        );
      })() : null}
      <p className="flex items-start gap-2 text-caption text-quiet"><CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />Generating a file only means a PDF exists. Nothing is "applied" until a person says so.</p>
    </div>
  );
}
