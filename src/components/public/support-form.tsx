"use client";
import * as React from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORT_KIND_LABELS, supportSchema, type SupportInput } from "@/lib/support-schema";
import { SUPPORT_KINDS } from "@/server/domain/enums";
import { submitSupportCase } from "@/app/(public)/support/actions";

type Defaults = { kind?: string; serial?: string; ref?: string };

export function SupportForm({ defaults }: { defaults: Defaults }) {
  const [done, setDone] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const kind = (SUPPORT_KINDS as readonly string[]).includes(defaults.kind ?? "") ? (defaults.kind as SupportInput["kind"]) : "question";

  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<SupportInput>({
    resolver: zodResolver(supportSchema),
    defaultValues: { kind, subject: "", message: "", name: "", email: "", phone: "", serial: defaults.serial ?? "", ref: defaults.ref ?? "", consent: undefined as unknown as true, website: "" },
  });

  if (done) {
    return (
      <div role="status" className="rounded-2xl border border-success-line bg-success-soft p-6 sm:p-8">
        <CheckCircle2 aria-hidden className="size-8 text-success" strokeWidth={1.6} />
        <h2 className="text-heading mt-4">Message received</h2>
        <p className="mt-2 text-body">Your reference is <span className="text-serial font-semibold text-ink">{done}</span>. Keep it handy: quote it if you contact us again. We'll reply using the details you gave us.</p>
        <Button asChild variant="secondary" className="mt-6"><Link href="/">Back to the home page</Link></Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        const res = await submitSupportCase(values);
        if (res.ok) { setDone(res.reference); toast.success("Message sent"); return; }
        setFormError(res.error);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof SupportInput, { message });
      })}
    >
      {formError ? <Alert tone="danger" title="Not sent">{formError}</Alert> : null}

      <Field label="What is this about?" required error={errors.kind?.message}>
        <Controller control={control} name="kind" render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SUPPORT_KINDS.map((k) => <SelectItem key={k} value={k}>{SUPPORT_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
          </Select>
        )} />
      </Field>
      <Field label="Title" required error={errors.subject?.message}><Input {...register("subject")} maxLength={160} autoComplete="off" /></Field>
      <Field label="Your message" required error={errors.message?.message} hint="Tell us what you saw and where you got the part. Please don't include the code itself.">
        <Textarea {...register("message")} rows={6} maxLength={4000} />
      </Field>
      <Field label="Serial number on the label" optionalLabel error={errors.serial?.message} hint="For example AXM-00012345. It helps us find the right record.">
        <Input {...register("serial")} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="text-serial" />
      </Field>

      <fieldset className="grid gap-5 rounded-xl border border-line bg-cloud p-5">
        <legend className="px-2 text-label">How can we reach you?</legend>
        <p className="-mt-2 text-small text-quiet">Give at least an email address or a phone number.</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
          <Field label="Your name" optionalLabel error={errors.name?.message}><Input {...register("name")} autoComplete="name" /></Field>
          <Field label="Email" error={errors.email?.message}><Input {...register("email")} type="email" autoComplete="email" inputMode="email" /></Field>
          <Field label="Phone" optionalLabel error={errors.phone?.message} className="sm:col-span-2 sm:max-w-[calc(50%-0.625rem)]"><Input {...register("phone")} type="tel" autoComplete="tel" inputMode="tel" /></Field>
        </div>
      </fieldset>

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input type="text" tabIndex={-1} autoComplete="off" {...register("website")} /></label>
      </div>

      <div>
        <div className="flex items-start gap-3">
          <Controller control={control} name="consent" render={({ field }) => (
            <Checkbox id="consent" checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true ? true : undefined)} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "consent-err" : undefined} className="mt-0.5" />
          )} />
          <label htmlFor="consent" className="text-small text-body">
            I understand my details will be used only to reply to this message and kept as described in the <Link href="/privacy" className="font-medium text-brand underline underline-offset-4">privacy notice</Link>.
          </label>
        </div>
        {errors.consent ? <p id="consent-err" role="alert" className="mt-2 text-caption font-medium text-danger">{errors.consent.message}</p> : null}
      </div>

      <Button type="submit" size="lg" loading={isSubmitting} className="sm:w-fit"><Send aria-hidden />Send message</Button>
    </form>
  );
}
