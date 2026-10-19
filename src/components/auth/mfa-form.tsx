"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { mfaCodeSchema } from "@/lib/auth-schema";
import { verifyMfa } from "@/app/(auth)/actions";

export function MfaForm({ next }: { next?: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<{ code: string }>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: "" } });
  return (
    <form noValidate className="grid gap-5" onSubmit={handleSubmit(async (v) => {
      setError(null);
      const res = await verifyMfa(v, next);
      if (res && !res.ok) { setError(res.error); if (res.fieldErrors?.code) setFieldError("code", { message: res.fieldErrors.code }); }
    })}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="6-digit code" error={errors.code?.message} required>
        <Input {...register("code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" className="h-12 text-center font-mono text-xl tracking-[0.5em]" autoFocus />
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting}><ShieldCheck aria-hidden />Verify and continue</Button>
    </form>
  );
}
