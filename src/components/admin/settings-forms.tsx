"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wordmark } from "@/components/brand/brand-mark";
import { companySchema, retentionSchema, riskSchema, type CompanyInput, type RetentionInput, type RiskInput } from "@/lib/schemas/settings";
import { labelSpecSchema, type LabelSpec } from "@/server/labels/spec";
import { removeLogo, saveCompany, saveLabelDefaults, saveRetention, saveRiskRules, uploadLogo } from "@/app/admin/settings/actions";
import type { ActionResult } from "@/server/auth/guards";

function useSave<T extends FieldValues>(form: UseFormReturn<T>, action: (v: T) => Promise<ActionResult>, ok: string) {
  const router = useRouter();
  const [err, setErr] = React.useState<string | null>(null);
  const submit = form.handleSubmit(async (values: T) => {
    setErr(null);
    const r = await action(values);
    if (r.ok) { toast.success(ok); form.reset(values); router.refresh(); return; }
    setErr(r.error);
    for (const [f, m] of Object.entries(r.fieldErrors ?? {})) form.setError(f as Path<T>, { message: m });
  });
  return { submit, err };
}

const SaveBar = ({ dirty, loading, canWrite }: { dirty: boolean; loading: boolean; canWrite: boolean }) => canWrite ? <div><Button type="submit" loading={loading} disabled={!dirty}><Save aria-hidden />Save changes</Button></div> : <Alert tone="info">You can view settings but only an owner can change them.</Alert>;

export function CompanyForm({ initial, canWrite }: { initial: CompanyInput; canWrite: boolean }) {
  const form = useForm<CompanyInput>({ resolver: zodResolver(companySchema), defaultValues: initial });
  const { submit, err } = useSave(form, saveCompany, "Company details saved");
  const { register, control, formState: { errors, isSubmitting, isDirty } } = form;
  return (
    <form noValidate className="grid gap-5" onSubmit={submit}>
      {err ? <Alert tone="danger">{err}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Company name" required error={errors.companyName?.message} hint="Shown to customers everywhere."><Input {...register("companyName")} disabled={!canWrite} /></Field>
        <Field label="Legal name" optionalLabel error={errors.legalName?.message} hint="Used in the privacy notice and terms."><Input {...register("legalName")} disabled={!canWrite} /></Field>
        <Field label="Support email" optionalLabel error={errors.supportEmail?.message}><Input {...register("supportEmail")} type="email" disabled={!canWrite} /></Field>
        <Field label="Support phone" optionalLabel error={errors.supportPhone?.message}><Input {...register("supportPhone")} type="tel" disabled={!canWrite} /></Field>
        <Field label="Company website" optionalLabel error={errors.websiteUrl?.message}><Input {...register("websiteUrl")} placeholder="https://" disabled={!canWrite} /></Field>
        <Field label="Serial prefix" required error={errors.serialPrefix?.message} hint="Applies to units registered from now on. Existing serials never change."><Input {...register("serialPrefix")} className="text-serial uppercase" disabled={!canWrite} /></Field>
        <Field label="Privacy notice link" optionalLabel error={errors.privacyUrl?.message} hint="Leave empty to use the built-in privacy page."><Input {...register("privacyUrl")} placeholder="/privacy or https://…" disabled={!canWrite} /></Field>
        <Field label="Terms link" optionalLabel error={errors.termsUrl?.message} hint="Leave empty to use the built-in terms page."><Input {...register("termsUrl")} placeholder="/terms or https://…" disabled={!canWrite} /></Field>
      </div>
      <Field label="Brand colour theme" required error={errors.brandTheme?.message} hint="Only approved themes are available so contrast stays accessible.">
        <Controller control={control} name="brandTheme" render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange} disabled={!canWrite}><SelectTrigger className="sm:max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="trust_blue">Trust blue (default)</SelectItem><SelectItem value="deep_blue">Deep blue</SelectItem><SelectItem value="teal">Teal</SelectItem></SelectContent></Select>
        )} />
      </Field>
      <SaveBar dirty={isDirty} loading={isSubmitting} canWrite={canWrite} />
    </form>
  );
}

export function LogoCard({ company, logoUrl, canWrite }: { company: string; logoUrl: string | null; canWrite: boolean }) {
  const router = useRouter();
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-line bg-white p-5"><Wordmark name={company} logoUrl={logoUrl} /><p className="mt-3 text-caption text-quiet">How the mark appears in the header and sign-in page. Without a logo, a placeholder shield is used.</p></div>
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload logo" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            setBusy(true); setErr(null);
            const fd = new FormData(); fd.set("logo", file);
            const r = await uploadLogo(fd); setBusy(false); if (ref.current) ref.current.value = "";
            if (r.ok) { toast.success("Logo updated"); router.refresh(); } else { setErr(r.error); }
          }} />
          <Button variant="secondary" loading={busy} onClick={() => ref.current?.click()}><ImagePlus aria-hidden />{logoUrl ? "Replace logo" : "Upload logo"}</Button>
          {logoUrl ? <Button variant="ghost" onClick={async () => { const r = await removeLogo(); if (r.ok) { toast.success("Logo removed"); router.refresh(); } else { toast.error(r.error); } }}><Trash2 aria-hidden />Remove</Button> : null}
        </div>
      ) : null}
      <p className="text-caption text-quiet">PNG, JPEG or WebP up to 1 MB, ideally a wide mark on a transparent background (about 160 × 32 px at 2×).</p>
    </div>
  );
}

export function LabelDefaultsForm({ initial, canWrite }: { initial: LabelSpec; canWrite: boolean }) {
  const form = useForm<LabelSpec>({ resolver: zodResolver(labelSpecSchema) as never, defaultValues: initial });
  const { submit, err } = useSave(form, saveLabelDefaults, "Label defaults saved");
  const { register, control, formState: { errors, isSubmitting, isDirty } } = form;
  const n = (name: keyof LabelSpec, label: string) => <Field label={label} error={errors[name]?.message as string | undefined}><Input type="number" step="0.1" {...register(name)} disabled={!canWrite} /></Field>;
  return (
    <form noValidate className="grid gap-5" onSubmit={submit}>
      {err ? <Alert tone="danger">{err}</Alert> : null}
      <p className="text-small text-body">Starting values for the label wizard. Each job can still override them, and the wizard checks every layout for physical fit and scannability.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Paper"><Controller control={control} name="page" render={({ field }) => <Select value={field.value} onValueChange={field.onChange} disabled={!canWrite}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="A4">A4</SelectItem><SelectItem value="LETTER">US Letter</SelectItem></SelectContent></Select>} /></Field>
        {n("labelWidthMm", "Label width (mm)")}{n("labelHeightMm", "Label height (mm)")}{n("qrSizeMm", "QR size (mm)")}
        <Field label="Error correction"><Controller control={control} name="qrErrorCorrection" render={({ field }) => <Select value={field.value} onValueChange={field.onChange} disabled={!canWrite}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="M">M (15%)</SelectItem><SelectItem value="Q">Q (25%)</SelectItem><SelectItem value="H">H (30%)</SelectItem></SelectContent></Select>} /></Field>
        <div className="grid content-end pb-2"><label className="flex items-center gap-2.5 text-small"><Controller control={control} name="cutGuides" render={({ field }) => <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={!canWrite} />} />Print light cut guides</label></div>
        {n("marginTopMm", "Top margin")}{n("marginLeftMm", "Left margin")}{n("gapXMm", "Gap across")}{n("gapYMm", "Gap down")}
      </div>
      <SaveBar dirty={isDirty} loading={isSubmitting} canWrite={canWrite} />
    </form>
  );
}

const RISK_FIELDS: { name: keyof RiskInput; label: string; help: string }[] = [
  { name: "rapidWindowMinutes", label: "Rapid-repeat window (minutes)", help: "Look-back window for the rapid-repeat rule." },
  { name: "rapidScans", label: "Rapid-repeat checks", help: "This many customer checks of one part inside the window raises the signal." },
  { name: "networkWindowHours", label: "Network & country window (hours)", help: "Look-back window for the multi-network and multi-country rules." },
  { name: "distinctNetworks", label: "Distinct networks", help: "Checks of one part from this many different networks." },
  { name: "distinctCountries", label: "Distinct countries", help: "Checks of one part from this many different countries." },
  { name: "lifetimeScans", label: "Lifetime checks", help: "Total customer checks of one part that is unusually high." },
  { name: "revokedScans24h", label: "Revoked-code presentations (24 h)", help: "A withdrawn code being presented this many times opens a case." },
  { name: "suspiciousScore", label: "Score that flags a repeat check", help: "Rules add points (rapid 2, networks 2, countries 2, lifetime 1). This is the total needed." },
];

export function RiskForm({ initial, canWrite }: { initial: RiskInput; canWrite: boolean }) {
  const form = useForm<RiskInput>({ resolver: zodResolver(riskSchema) as never, defaultValues: initial });
  const { submit, err } = useSave(form, saveRiskRules, "Risk rules saved");
  const { register, formState: { errors, isSubmitting, isDirty } } = form;
  return (
    <form noValidate className="grid gap-5" onSubmit={submit}>
      {err ? <Alert tone="danger">{err}</Alert> : null}
      <Alert tone="info" title="How these work">Each rule counts signals about one part from customer checks only (staff QC and bots are excluded). They never block a customer; they decide whether the result shows a neutral note and whether an investigation is opened for a person to review. Changes apply to the next check.</Alert>
      <div className="grid gap-5 sm:grid-cols-2">{RISK_FIELDS.map((f) => <Field key={f.name} label={f.label} hint={f.help} error={errors[f.name]?.message as string | undefined}><Input type="number" inputMode="numeric" {...register(f.name)} disabled={!canWrite} /></Field>)}</div>
      <SaveBar dirty={isDirty} loading={isSubmitting} canWrite={canWrite} />
    </form>
  );
}

export function RetentionForm({ initial, canWrite }: { initial: RetentionInput; canWrite: boolean }) {
  const form = useForm<RetentionInput>({ resolver: zodResolver(retentionSchema) as never, defaultValues: initial });
  const { submit, err } = useSave(form, saveRetention, "Retention periods saved");
  const { register, formState: { errors, isSubmitting, isDirty } } = form;
  return (
    <form noValidate className="grid gap-5" onSubmit={submit}>
      {err ? <Alert tone="danger">{err}</Alert> : null}
      <p className="text-small text-body">How long personal and security data is kept. A scheduled job applies these daily; the privacy notice quotes them.</p>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Network fingerprints (days)" hint="Then the coarse network hash and country are erased from events." error={errors.verificationNetworkDays?.message as string | undefined}><Input type="number" {...register("verificationNetworkDays")} disabled={!canWrite} /></Field>
        <Field label="Support cases (days)" hint="Then resolved cases are anonymised." error={errors.supportCaseDays?.message as string | undefined}><Input type="number" {...register("supportCaseDays")} disabled={!canWrite} /></Field>
        <Field label="Label PDFs (days)" hint="Then the files (live codes) are deleted from storage." error={errors.labelArtifactDays?.message as string | undefined}><Input type="number" {...register("labelArtifactDays")} disabled={!canWrite} /></Field>
      </div>
      <SaveBar dirty={isDirty} loading={isSubmitting} canWrite={canWrite} />
    </form>
  );
}
