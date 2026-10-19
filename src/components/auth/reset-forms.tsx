"use client";
import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, KeyRound, Mail } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { newPasswordSchema, resetRequestSchema, type NewPasswordValues } from "@/lib/auth-schema";
import { confirmEmailToken, requestPasswordReset, setNewPassword } from "@/app/(auth)/actions";

export function ResetRequestForm() {
  const [sent, setSent] = React.useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(resetRequestSchema), defaultValues: { email: "" } });
  if (sent) {
    return (
      <div role="status" className="rounded-xl border border-success-line bg-success-soft p-5">
        <CheckCircle2 aria-hidden className="size-6 text-success" />
        <p className="mt-3 font-semibold text-ink">Check your email</p>
        <p className="mt-1 text-small text-body">If that address belongs to a staff account, we've sent a link to set a new password. It expires after a short time and works once.</p>
        <Button asChild variant="secondary" className="mt-4"><Link href="/login">Back to sign in</Link></Button>
      </div>
    );
  }
  return (
    <form noValidate className="grid gap-5" onSubmit={handleSubmit(async (v) => { await requestPasswordReset(v); setSent(true); })}>
      <Field label="Work email" error={errors.email?.message} required><Input {...register("email")} type="email" autoComplete="username" inputMode="email" autoCapitalize="none" /></Field>
      <Button type="submit" size="lg" loading={isSubmitting}><Mail aria-hidden />Send reset link</Button>
      <Link href="/login" className="w-fit text-small font-medium text-brand underline-offset-4 hover:underline">Back to sign in</Link>
    </form>
  );
}

export function NewPasswordForm() {
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: "", confirm: "" } });
  return (
    <form noValidate className="grid gap-5" onSubmit={handleSubmit(async (v) => {
      setError(null);
      const res = await setNewPassword(v);
      if (res && !res.ok) { setError(res.error); for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setFieldError(f as keyof NewPasswordValues, { message: m }); }
    })}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="New password" required error={errors.password?.message} hint="At least 12 characters. Don't reuse a password from elsewhere."><Input {...register("password")} type="password" autoComplete="new-password" /></Field>
      <Field label="Repeat the new password" required error={errors.confirm?.message}><Input {...register("confirm")} type="password" autoComplete="new-password" /></Field>
      <Button type="submit" size="lg" loading={isSubmitting}><KeyRound aria-hidden />Set password and sign out everywhere</Button>
    </form>
  );
}

export function ConfirmTokenForm({ tokenHash, type, next }: { tokenHash: string; type: string; next: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="grid gap-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button size="lg" loading={busy} onClick={async () => {
        setBusy(true); setError(null);
        const res = await confirmEmailToken(tokenHash, type, next);
        if (res && !res.ok) setError(res.error);
        setBusy(false);
      }}>Continue</Button>
    </div>
  );
}
