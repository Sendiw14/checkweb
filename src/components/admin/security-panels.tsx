"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LogOut, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/public/copy-button";
import { changePasswordSchema, mfaCodeSchema, type ChangePasswordValues } from "@/lib/auth-schema";
import { changePassword, enrollTotp, removeTotp, signOutOtherDevices, verifyEnrollment, type TotpEnrolment } from "@/app/admin/security/actions";

const groupSecret = (s: string) => s.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

export function MfaCard({ enrolled, aal2, requiredByPolicy, mustFinish }: { enrolled: boolean; aal2: boolean; requiredByPolicy: boolean; mustFinish: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = React.useState<TotpEnrolment | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<{ code: string }>({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: "" } });

  async function start() {
    setStarting(true); setErr(null);
    const r = await enrollTotp();
    setStarting(false);
    if (r.ok && r.data) { setSetup(r.data); reset(); } else if (!r.ok) setErr(r.error);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle as="h2" className="flex items-center gap-2"><Smartphone aria-hidden className="size-4 text-brand" />Two-step verification</CardTitle>
          {enrolled ? <Badge tone="success"><ShieldCheck aria-hidden className="size-3" />On</Badge> : <Badge tone={requiredByPolicy ? "warning" : "neutral"}>{requiredByPolicy ? "Required, not set up" : "Off"}</Badge>}
        </div>
        <CardDescription>After your password, you enter a 6-digit code from an authenticator app (such as 1Password, Authy or Google Authenticator). A stolen password alone then isn’t enough to get in.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {mustFinish ? <Alert tone="warning" title="Finish setting this up to continue">Your role requires two-step verification before you can use the rest of the workspace.</Alert> : null}
        {err ? <Alert tone="danger">{err}</Alert> : null}

        {enrolled ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-small text-body">An authenticator app is linked to your account.</p>
            {requiredByPolicy
              ? <span className="text-caption text-quiet">Required for your role, so it can’t be turned off.</span>
              : <Button variant="secondary" onClick={() => setConfirmRemove(true)} disabled={!aal2}><ShieldOff aria-hidden />Remove</Button>}
            {!requiredByPolicy && !aal2 ? <span className="text-caption text-quiet">Sign in with your code first to remove it.</span> : null}
          </div>
        ) : setup ? (
          <form noValidate className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[auto_1fr] md:gap-8" onSubmit={handleSubmit(async (v) => {
            setErr(null);
            const r = await verifyEnrollment(setup.factorId, v);
            if (r.ok) {
              toast.success("Two-step verification is on");
              setSetup(null);
              if (mustFinish) router.replace("/admin/dashboard"); else router.refresh();
              return;
            }
            setErr(r.error);
            if (r.fieldErrors?.code) setError("code", { message: r.fieldErrors.code });
          })}>
            <div className="self-start justify-self-start rounded-lg border border-line bg-white p-3" role="img" aria-label="QR code for your authenticator app. If you can’t scan it, type the setup key shown beside it.">
              <svg viewBox={`-2 -2 ${setup.qr.size + 4} ${setup.qr.size + 4}`} className="size-44" shapeRendering="crispEdges" aria-hidden>
                <rect x="-2" y="-2" width={setup.qr.size + 4} height={setup.qr.size + 4} fill="#fff" />
                <path d={setup.qr.d} fill="#000" />
              </svg>
            </div>
            <div className="grid content-start gap-4">
              <ol className="list-decimal space-y-1.5 pl-5 text-small text-body">
                <li>Open your authenticator app and add an account.</li>
                <li>Scan the code, or type this setup key instead:</li>
              </ol>
              <div className="flex items-center gap-1 rounded-md border border-line bg-cloud px-3 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-small text-ink">{groupSecret(setup.secret)}</code>
                <CopyButton value={setup.secret} label="setup key" />
              </div>
              <Field label="6-digit code from the app" error={errors.code?.message} required>
                <Input {...register("code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="h-11 max-w-48 text-center font-mono text-lg tracking-[0.4em]" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={isSubmitting}><ShieldCheck aria-hidden />Turn on</Button>
                <Button type="button" variant="ghost" onClick={() => setSetup(null)} disabled={isSubmitting}>Cancel</Button>
              </div>
            </div>
          </form>
        ) : (
          <div><Button onClick={start} loading={starting}><Smartphone aria-hidden />Set up authenticator</Button></div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmRemove} onOpenChange={setConfirmRemove} tone="danger" title="Turn off two-step verification?"
        description="Your account will rely on your password alone. You can set it up again at any time."
        confirmLabel="Turn off"
        onConfirm={async () => {
          const r = await removeTotp();
          if (r.ok) { toast.success("Two-step verification is off"); setConfirmRemove(false); router.refresh(); } else toast.error(r.error);
        }}
      />
    </Card>
  );
}

export function PasswordCard() {
  const [err, setErr] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema), defaultValues: { current: "", password: "", confirm: "" },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2"><KeyRound aria-hidden className="size-4 text-brand" />Password</CardTitle>
        <CardDescription>Use at least 12 characters. A few unrelated words are easier to remember and harder to guess. Changing it signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate className="grid max-w-md gap-4" onSubmit={handleSubmit(async (v) => {
          setErr(null);
          const r = await changePassword(v);
          if (r.ok) { toast.success("Password updated. Other devices were signed out."); reset(); return; }
          setErr(r.error);
          for (const [f, m] of Object.entries(r.fieldErrors ?? {})) if (m) setError(f as keyof ChangePasswordValues, { message: m });
        })}>
          {err ? <Alert tone="danger">{err}</Alert> : null}
          <Field label="Current password" error={errors.current?.message} required>
            <Input type="password" autoComplete="current-password" {...register("current")} />
          </Field>
          <Field label="New password" error={errors.password?.message} required>
            <Input type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Confirm new password" error={errors.confirm?.message} required>
            <Input type="password" autoComplete="new-password" {...register("confirm")} />
          </Field>
          <div><Button type="submit" loading={isSubmitting}>Update password</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SessionsCard() {
  const [busy, setBusy] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2"><LogOut aria-hidden className="size-4 text-brand" />Other devices</CardTitle>
        <CardDescription>Left yourself signed in on a shared or lost computer? End every other session. This one stays signed in.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="secondary" loading={busy} onClick={async () => {
          setBusy(true);
          const r = await signOutOtherDevices();
          setBusy(false);
          if (r.ok) toast.success("Signed out of all other devices"); else toast.error(r.error);
        }}>Sign out other devices</Button>
      </CardContent>
    </Card>
  );
}
