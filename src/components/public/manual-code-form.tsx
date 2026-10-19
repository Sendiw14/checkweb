"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { credentialShape, formatAsTyped, stripToCredential, normalizeManualCode } from "@/lib/credential-format";
import { cn } from "@/lib/utils";

const schema = z.object({
  credential: z
    .string()
    .trim()
    .min(1, "Enter the code printed on the label.")
    .refine((v) => credentialShape(v) !== null, "That doesn't look like a valid code. It has 20 letters and numbers, like ABCD-EFGH-JKMN-PQRS-TVWX."),
});
type Values = z.infer<typeof schema>;

/** Manual fallback for damaged / unreadable QR codes. The code is held in memory and sent by POST, never put in a URL query. */
export function ManualCodeForm({
  onSubmitCode, submitLabel = "Check code", busy = false, className, label = "Verification code", hint, inputId,
}: {
  onSubmitCode: (credential: string) => void | Promise<void>; submitLabel?: string; busy?: boolean; className?: string; label?: string; hint?: React.ReactNode; inputId?: string;
}) {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { credential: "" } });
  const reg = register("credential");

  return (
    <form
      noValidate
      className={cn("grid gap-3", className)}
      onSubmit={handleSubmit(async ({ credential }) => {
        const clean = stripToCredential(credential);
        await onSubmitCode(normalizeManualCode(clean) ?? clean);
      })}
    >
      <Field id={inputId} label={label} hint={hint} error={errors.credential?.message}>
        <Input
          {...reg}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD-EFGH-JKMN-PQRS-TVWX"
          className="text-serial h-12 text-[0.9375rem] tracking-[0.06em]"
          onChange={(e) => {
            const formatted = formatAsTyped(e.target.value);
            setValue("credential", formatted, { shouldValidate: !!errors.credential });
          }}
        />
      </Field>
      <Button type="submit" size="lg" loading={busy || isSubmitting}>
        {submitLabel}
        <ArrowRight aria-hidden />
      </Button>
    </form>
  );
}
