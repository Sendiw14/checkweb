"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileLock2, QrCode } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LabelPreview, SheetPreview } from "@/components/admin/label-preview";
import { checkSpec, labelSpecSchema, type LabelSpec } from "@/server/labels/spec";
import { createLabelJob } from "@/app/admin/labels/actions";
import { StatusBadge } from "@/components/admin/status";
import { cn, formatNumber } from "@/lib/utils";
import { fadeUp } from "@/lib/motion";

type BatchOpt = { id: string; batch_code: string; product_name: string; sku: string; processing_status: string; release_status: string; unlabelled: number; registered: number };
type Qr = { size: number; d: string };
const STEPS = ["Batch", "Quantity and layout", "Review"] as const;
const CHUNK = 500;

export function LabelWizard({ batches, defaults, qrByEc, initialBatch, daysToExpiry }: { batches: BatchOpt[]; defaults: LabelSpec; qrByEc: Record<"M" | "Q" | "H", Qr>; initialBatch?: string; daysToExpiry: number }) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialBatch && batches.some((b) => b.id === initialBatch) ? 1 : 0);
  const [batchId, setBatchId] = React.useState<string>(initialBatch && batches.some((b) => b.id === initialBatch) ? initialBatch : "");
  const batch = batches.find((b) => b.id === batchId);
  const [quantity, setQuantity] = React.useState<string>(batch ? String(batch.unlabelled) : "");
  const [spec, setSpec] = React.useState<LabelSpec>(defaults);
  const [filter, setFilter] = React.useState("");
  const [ack, setAck] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const keyRef = React.useRef<string>(crypto.randomUUID()); // idempotency: a double click or retry can never create two jobs

  const qr = qrByEc[spec.qrErrorCorrection];
  const check = checkSpec(spec, qr.size);
  const qty = Number(quantity);
  const qtyError = !batch ? null : !Number.isInteger(qty) || qty < 1 ? "Enter a whole number of labels." : qty > batch.unlabelled ? `Only ${formatNumber(batch.unlabelled)} units in this batch are waiting for a label.` : null;
  const pages = check.layout.perPage > 0 && qty > 0 ? Math.ceil(qty / check.layout.perPage) : 0;
  const parts = qty > 0 ? Math.ceil(qty / CHUNK) : 0;

  const num = (k: keyof LabelSpec) => (e: React.ChangeEvent<HTMLInputElement>) => setSpec((s) => ({ ...s, [k]: e.target.value === "" ? 0 : Number(e.target.value) }));
  const visible = batches.filter((b) => !filter || `${b.batch_code} ${b.product_name} ${b.sku}`.toLowerCase().includes(filter.toLowerCase()));

  const canNext = step === 0 ? !!batch : step === 1 ? !qtyError && check.ok && !!batch : ack;

  async function submit() {
    if (!batch) return;
    setBusy(true); setError(null);
    const parsed = labelSpecSchema.safeParse(spec);
    if (!parsed.success) { setError("The layout has a value that isn't allowed."); setBusy(false); return; }
    const res = await createLabelJob({ batchId: batch.id, quantity: qty, idempotencyKey: keyRef.current, spec: parsed.data });
    setBusy(false);
    if (res.ok && res.data) { toast.success(`Job created for ${formatNumber(res.data.allocated)} labels`); router.push(`/admin/label-jobs/${res.data.jobId}?autostart=1`); }
    else if (!res.ok) setError(res.error);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <ol aria-label="Progress" className="mb-8 flex items-center gap-2 text-small">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
              <span className={cn("grid size-7 place-items-center rounded-full border text-caption font-semibold", i < step ? "border-brand bg-brand text-white" : i === step ? "border-brand bg-brand-soft text-brand" : "border-line-strong text-quiet")}>{i < step ? <Check aria-hidden className="size-3.5" /> : i + 1}</span>
              <span className={cn("hidden sm:inline", i === step ? "font-semibold text-ink" : "text-quiet")}>{s}</span>
              {i < STEPS.length - 1 ? <span aria-hidden className="mx-1 h-px w-6 bg-line-strong sm:w-10" /> : null}
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} variants={fadeUp} initial="hidden" animate="visible" exit="exit">
            {step === 0 ? (
              <section aria-labelledby="s0">
                <h2 id="s0" className="text-heading">Which batch needs labels?</h2>
                <p className="mt-1 text-body">Only batches with units waiting for a code are listed. Quarantined and on-hold batches are excluded.</p>
                {batches.length === 0 ? <Alert tone="info" className="mt-5" title="Nothing is waiting for labels">Every registered unit already has a code, or no batch is registered. Register units on a batch first.</Alert> : (
                  <>
                    <div className="mt-5 max-w-sm"><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by batch, product or SKU" aria-label="Filter batches" /></div>
                    <div role="radiogroup" aria-label="Batches" className="mt-4 grid gap-2.5">
                      {visible.map((b) => (
                        <button key={b.id} type="button" role="radio" aria-checked={b.id === batchId} onClick={() => { setBatchId(b.id); setQuantity(String(b.unlabelled)); }}
                          className={cn("flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4 text-left transition-[border-color,box-shadow]", b.id === batchId ? "border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_18%,transparent)]" : "border-line hover:border-line-strong")}>
                          <span className="min-w-0"><span className="block font-mono text-small font-semibold text-ink">{b.batch_code}</span><span className="block truncate text-small text-quiet">{b.product_name} · {b.sku}</span></span>
                          <span className="flex items-center gap-3"><StatusBadge kind="batchRelease" value={b.release_status} /><span className="tabular text-small"><b className="text-ink">{formatNumber(b.unlabelled)}</b> <span className="text-quiet">waiting of {formatNumber(b.registered)}</span></span></span>
                        </button>
                      ))}
                      {visible.length === 0 ? <p className="py-6 text-center text-small text-quiet">No batches match “{filter}”.</p> : null}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {step === 1 && batch ? (
              <section aria-labelledby="s1" className="grid gap-6">
                <div><h2 id="s1" className="text-heading">Quantity and layout</h2><p className="mt-1 text-body">Sizes are in millimetres. The preview is drawn to scale.</p></div>
                <Field label="Number of labels" required error={qtyError} hint={`${formatNumber(batch.unlabelled)} units in ${batch.batch_code} are waiting. Labels are assigned in serial-number order.`}>
                  <Input type="number" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} min={1} max={Math.min(batch.unlabelled, 100000)} className="sm:max-w-48" />
                </Field>
                <fieldset className="grid gap-4 rounded-xl border border-line bg-white p-5">
                  <legend className="px-2 text-label">Label and sheet</legend>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Paper"><Select value={spec.page} onValueChange={(v) => setSpec((s) => ({ ...s, page: v as LabelSpec["page"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="A4">A4 (210 × 297)</SelectItem><SelectItem value="LETTER">US Letter</SelectItem></SelectContent></Select></Field>
                    <Field label="Label width (mm)"><Input type="number" step="0.1" value={spec.labelWidthMm} onChange={num("labelWidthMm")} /></Field>
                    <Field label="Label height (mm)"><Input type="number" step="0.1" value={spec.labelHeightMm} onChange={num("labelHeightMm")} /></Field>
                    <Field label="QR size (mm)" hint="Symbol only; the quiet zone is added around it."><Input type="number" step="0.1" value={spec.qrSizeMm} onChange={num("qrSizeMm")} /></Field>
                    <Field label="Error correction" hint="Q or H survive scuffing best."><Select value={spec.qrErrorCorrection} onValueChange={(v) => setSpec((s) => ({ ...s, qrErrorCorrection: v as LabelSpec["qrErrorCorrection"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="M">M (15%)</SelectItem><SelectItem value="Q">Q (25%)</SelectItem><SelectItem value="H">H (30%)</SelectItem></SelectContent></Select></Field>
                    <div className="grid content-end pb-2"><label className="flex items-center gap-2.5 text-small"><Checkbox checked={spec.cutGuides} onCheckedChange={(v) => setSpec((s) => ({ ...s, cutGuides: v === true }))} />Print light cut guides</label></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <Field label="Top margin"><Input type="number" step="0.1" value={spec.marginTopMm} onChange={num("marginTopMm")} /></Field>
                    <Field label="Left margin"><Input type="number" step="0.1" value={spec.marginLeftMm} onChange={num("marginLeftMm")} /></Field>
                    <Field label="Gap across"><Input type="number" step="0.1" value={spec.gapXMm} onChange={num("gapXMm")} /></Field>
                    <Field label="Gap down"><Input type="number" step="0.1" value={spec.gapYMm} onChange={num("gapYMm")} /></Field>
                  </div>
                </fieldset>
                {check.errors.map((e) => <Alert key={e} tone="danger">{e}</Alert>)}
                {check.warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
                {check.ok ? <p className="text-small text-quiet">{check.moduleMm ? `Each QR module prints ${check.moduleMm.toFixed(2)} mm wide. ` : ""}{check.layout.cols} × {check.layout.rows} = <b className="text-ink">{check.layout.perPage}</b> labels per page{pages ? ` → ${formatNumber(pages)} page${pages === 1 ? "" : "s"} in ${formatNumber(parts)} file${parts === 1 ? "" : "s"}` : ""}.</p> : null}
              </section>
            ) : null}

            {step === 2 && batch ? (
              <section aria-labelledby="s2" className="grid gap-6">
                <div><h2 id="s2" className="text-heading">Review and confirm</h2><p className="mt-1 text-body">Generating labels issues a new secret code for every unit. This step can't be undone, but unused codes can be revoked.</p></div>
                <dl className="divide-y divide-line rounded-xl border border-line bg-white text-small">
                  {[["Batch", <span key="b" className="font-mono">{batch.batch_code}</span>], ["Product", batch.product_name], ["Labels", formatNumber(qty)], ["Sheets", `${formatNumber(pages)} × ${spec.page}, in ${formatNumber(parts)} PDF file${parts === 1 ? "" : "s"}`], ["Label size", `${spec.labelWidthMm} × ${spec.labelHeightMm} mm, QR ${spec.qrSizeMm} mm (${spec.qrErrorCorrection})`], ["Files kept for", `${daysToExpiry} days, then deleted`]].map(([k, v]) => (
                    <div key={String(k)} className="flex items-baseline justify-between gap-6 px-4 py-3"><dt className="text-quiet">{k}</dt><dd className="text-right font-medium text-ink">{v}</dd></div>
                  ))}
                </dl>
                <Alert tone="warning" title="The PDFs contain live codes">
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>They're stored privately and every download is recorded against your name.</li>
                    <li>Only the people who print and apply the labels should have them. Don't email or share them.</li>
                    <li>Printing doesn't make a part verifiable: you'll confirm "printed" and "applied" afterwards, and release comes after QC.</li>
                  </ul>
                </Alert>
                <label className="flex items-start gap-3 text-small"><Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" /><span>I understand the files contain live verification codes and I'll handle them accordingly.</span></label>
                {error ? <Alert tone="danger" title="Couldn't create the job">{error}</Alert> : null}
              </section>
            ) : null}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {step > 0 ? <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft aria-hidden />Back</Button> : null}
          {step < 2 ? <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continue<ArrowRight aria-hidden /></Button>
            : <Button onClick={submit} loading={busy} disabled={!canNext}><QrCode aria-hidden />Generate {formatNumber(qty)} labels</Button>}
          {!canNext && step === 1 && !check.ok ? <span className="flex items-center gap-1.5 text-small text-danger"><AlertTriangle aria-hidden className="size-4" />Fix the layout to continue</span> : null}
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Preview">
        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-caption font-semibold uppercase tracking-wider text-quiet">Preview</p>
          <div className="mt-3 rounded-lg bg-cloud p-3"><LabelPreview spec={spec} qr={qr} /></div>
          <p className="mt-2 text-caption text-quiet">Dashed teal line = quiet zone ({spec.labelWidthMm} × {spec.labelHeightMm} mm label).</p>
          <div className="mt-5 flex items-start gap-4">
            <SheetPreview spec={spec} />
            <p className="text-caption text-quiet">{check.layout.cols} × {check.layout.rows} on {spec.page}. First label highlighted.</p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-caption text-quiet"><FileLock2 aria-hidden className="mt-0.5 size-4 shrink-0" />Print a test sheet and scan it with an iPhone and an Android phone before a full run.</p>
      </aside>
    </div>
  );
}
