"use client";
import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginValues } from "@/lib/auth-schema";
import { signIn } from "@/app/(auth)/actions";

export function LoginForm({ next, notice }: { next?: string; notice?: { tone: "info" | "success" | "danger"; text: string } | null }) {
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={handleSubmit(async (values) => {
        setError(null);
        const res = await signIn(values, next); // success redirects server-side
        if (res && !res.ok) {
          setError(res.error);
          for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setFieldError(f as keyof LoginValues, { message: m });
        }
      })}
    >
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Work email" error={errors.email?.message} required>
        <Input {...register("email")} type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} />
      </Field>
      <Field label="Password" error={errors.password?.message} required>
        <div className="relative">
          <Input {...register("password")} type={show ? "text" : "password"} autoComplete="current-password" className="pr-11" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-quiet hover:bg-subtle hover:text-ink">
            {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting}><LogIn aria-hidden />Sign in</Button>
      <Link href="/reset-password" className="w-fit text-small font-medium text-brand underline-offset-4 hover:underline">Forgot your password?</Link>
    </form>
  );
}
