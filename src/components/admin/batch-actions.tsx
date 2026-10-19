"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Ellipsis, Hand, PackageCheck, PackagePlus, Pause, Play, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { quantitySchema, reasonSchema } from "@/lib/schemas/batch";
import { registerUnits, setBatchProcessing, setQcHold, transitionBatch } from "@/app/admin/batches/actions";
import { formatNumber } from "@/lib/utils";

export type BatchActionState = {
  batchId: string; code: string; processing: string; release: string; registered: number; expected: number; registeredState: number; qcPassed: number;
  eligibleRelease: number; quarantined: number;
  can: { write: boolean; qc: boolean; release: boolean; quarantine: boolean };
};

type Dlg = null | "register" | "qc" | "release" | "quarantine" | "restore" | "cancel" | "complete";

export function BatchActions(s: BatchActionState) {
  const router = useRouter();
  const [dlg, setDlg] = React.useState<Dlg>(null);
  const done = (msg: string) => { toast.success(msg); router.refresh(); };
  const fail = (msg: string) => { toast.error(msg); throw new Error(msg); };

  const open = !["cancelled"].includes(s.processing);
  const canRegister = s.can.write && ["planned", "in_production"].includes(s.processing) && !["qc_hold", "quarantined"].includes(s.release) && s.registered < s.expected;
  const onHold = s.release === "qc_hold";
  const quarantined = s.release === "quarantined";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRegister ? <Button variant="secondary" onClick={() => setDlg("register")}><PackagePlus aria-hidden />Register units</Button> : null}
      {s.can.qc && s.registeredState > 0 && !quarantined && !onHold && open ? <Button variant="secondary" onClick={() => setDlg("qc")}><ShieldCheck aria-hidden />Pass QC ({formatNumber(s.registeredState)})</Button> : null}
      {s.can.release && s.eligibleRelease > 0 && !quarantined && !onHold ? <Button onClick={() => setDlg("release")}><PackageCheck aria-hidden />Release {formatNumber(s.eligibleRelease)} units</Button> : null}
      {s.can.quarantine && quarantined ? <Button onClick={() => setDlg("restore")}><RotateCcw aria-hidden />Restore from quarantine</Button> : null}
      {(s.can.qc || s.can.quarantine || s.can.write) ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" aria-label="More batch actions"><Ellipsis aria-hidden /></Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            {s.can.qc && s.release === "pending" ? <DropdownMenuItem onSelect={async () => { const r = await setQcHold(s.batchId, true); r.ok ? done("Batch placed on QC hold") : toast.error(r.error); }}><Hand aria-hidden />Place on QC hold</DropdownMenuItem> : null}
            {s.can.qc && onHold ? <DropdownMenuItem onSelect={async () => { const r = await setQcHold(s.batchId, false); r.ok ? done("QC hold lifted") : toast.error(r.error); }}><Play aria-hidden />Lift QC hold</DropdownMenuItem> : null}
            {s.can.write && s.processing === "planned" ? <DropdownMenuItem onSelect={async () => { const r = await setBatchProcessing(s.batchId, "in_production"); r.ok ? done("Production started") : toast.error(r.error); }}><Play aria-hidden />Mark in production</DropdownMenuItem> : null}
            {s.can.write && s.processing === "in_production" ? <DropdownMenuItem onSelect={() => setDlg("complete")}><CircleCheck aria-hidden />Mark production complete</DropdownMenuItem> : null}
            {s.can.quarantine && !quarantined && open ? (<><DropdownMenuSeparator /><DropdownMenuItem tone="danger" onSelect={() => setDlg("quarantine")}><Pause aria-hidden />Quarantine batch…</DropdownMenuItem></>) : null}
            {s.can.write && ["planned", "in_production"].includes(s.processing) ? <DropdownMenuItem tone="danger" onSelect={() => setDlg("cancel")}><XCircle aria-hidden />Cancel batch…</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <RegisterDialog open={dlg === "register"} onOpenChange={(v) => setDlg(v ? "register" : null)} batchId={s.batchId} remaining={s.expected - s.registered} onDone={(n) => done(`${formatNumber(n)} units registered`)} />
      <ConfirmDialog open={dlg === "qc"} onOpenChange={(v) => setDlg(v ? "qc" : null)} title="Pass quality control?" confirmLabel="Pass QC"
        description={<>Marks <b>{formatNumber(s.registeredState)}</b> registered units in <span className="font-mono">{s.code}</span> as having passed QC. They still can't be sold: release needs the label confirmed as applied.</>}
        onConfirm={async () => { const r = await transitionBatch(s.batchId, "qc"); r.ok ? done(`${formatNumber(r.data?.changed ?? 0)} units passed QC`) : fail(r.error); }} />
      <ConfirmDialog open={dlg === "release"} onOpenChange={(v) => setDlg(v ? "release" : null)} title="Release units for sale?" confirmLabel={`Release ${formatNumber(s.eligibleRelease)} units`}
        description={<>
          <p>This makes <b>{formatNumber(s.eligibleRelease)}</b> units in <span className="font-mono">{s.code}</span> verifiable as released: customers who scan them will see "Code recognized".</p>
          {s.qcPassed > s.eligibleRelease ? <p className="mt-2">{formatNumber(s.qcPassed - s.eligibleRelease)} QC-passed units won't be released because their label hasn't been confirmed as applied.</p> : null}
          <p className="mt-2">Releasing is recorded with your name in the audit log.</p></>}
        onConfirm={async () => { const r = await transitionBatch(s.batchId, "release"); r.ok ? done(`${formatNumber(r.data?.changed ?? 0)} units released`) : fail(r.error); }} />
      <ReasonDialog open={dlg === "quarantine"} onOpenChange={(v) => setDlg(v ? "quarantine" : null)} title="Quarantine this batch" requireText="QUARANTINE" confirmLabel="Quarantine batch"
        description={<>Every unit in <span className="font-mono">{s.code}</span> that isn't retired will be held. Customers who scan them will be told the part is on hold. You can restore the batch later.</>}
        onSubmit={async (reason) => { const r = await transitionBatch(s.batchId, "quarantine", { reason }); r.ok ? done(`${formatNumber(r.data?.changed ?? 0)} units quarantined`) : fail(r.error); }} />
      <ConfirmDialog open={dlg === "restore"} onOpenChange={(v) => setDlg(v ? "restore" : null)} title="Restore this batch?" confirmLabel="Restore"
        description="Quarantined units return to the state they were in before. Units that were released and still have an active token and applied label become verifiable again."
        onConfirm={async () => { const r = await transitionBatch(s.batchId, "restore"); r.ok ? done(`${formatNumber(r.data?.changed ?? 0)} units restored`) : fail(r.error); }} />
      <ConfirmDialog open={dlg === "complete"} onOpenChange={(v) => setDlg(v ? "complete" : null)} title="Mark production complete?" confirmLabel="Mark complete"
        description={s.registered < s.expected ? `Only ${formatNumber(s.registered)} of ${formatNumber(s.expected)} expected units are registered. After this, no more units can be added.` : "No more units can be added after this."}
        onConfirm={async () => { const r = await setBatchProcessing(s.batchId, "completed"); r.ok ? done("Production marked complete") : fail(r.error); }} />
      <ConfirmDialog open={dlg === "cancel"} onOpenChange={(v) => setDlg(v ? "cancel" : null)} title="Cancel this batch?" tone="danger" confirmLabel="Cancel batch" requireText={s.code}
        description="A cancelled batch can't receive units or labels. Units already registered keep their records. This can't be undone."
        onConfirm={async () => { const r = await setBatchProcessing(s.batchId, "cancelled"); r.ok ? done("Batch cancelled") : fail(r.error); }} />
    </div>
  );
}

function RegisterDialog({ open, onOpenChange, batchId, remaining, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; batchId: string; remaining: number; onDone: (n: number) => void }) {
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<{ quantity: number }>({ resolver: zodResolver(quantitySchema) as never, defaultValues: { quantity: Math.min(remaining, 100_000) } });
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset({ quantity: Math.min(remaining, 100_000) }); }}>
      <DialogContent title="Register units" description={`Up to ${formatNumber(remaining)} more units fit in this batch. Each gets its own serial number; no codes are issued yet.`}>
        <form noValidate className="grid gap-4" onSubmit={handleSubmit(async (v) => {
          const r = await registerUnits(batchId, v);
          if (r.ok && r.data) { onOpenChange(false); onDone(r.data.registered); } else if (!r.ok) setError("quantity", { message: r.error });
        })}>
          <Field label="How many units?" required error={errors.quantity?.message}><Input {...register("quantity")} type="number" inputMode="numeric" min={1} max={Math.min(remaining, 100000)} /></Field>
          <DialogFooter><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={isSubmitting}>Register</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, requireText, onSubmit, tone = "danger" }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description: React.ReactNode; confirmLabel: string; requireText?: string; tone?: "danger" | "primary"; onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const parsed = reasonSchema.safeParse({ reason });
  const blocked = !parsed.success || (!!requireText && typed.trim() !== requireText);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (busy) return; onOpenChange(v); if (!v) { setReason(""); setTyped(""); } }}>
      <DialogContent title={title} description={undefined}>
        <div className="text-small text-body">{description}</div>
        <Field label="Reason" required hint="Recorded in the audit log. Visible to staff, never to customers."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} /></Field>
        {requireText ? <Field label={<>Type <span className="font-mono text-ink">{requireText}</span> to confirm</>}><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} /></Field> : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} disabled={blocked} loading={busy} onClick={async () => { setBusy(true); try { await onSubmit(reason.trim()); onOpenChange(false); setReason(""); setTyped(""); } catch { /* toast already shown */ } finally { setBusy(false); } }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
