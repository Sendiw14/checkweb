import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { MfaForm } from "@/components/auth/mfa-form";
import { getSessionState } from "@/server/auth/session";
import { safeNext } from "@/server/auth/safe-next";

export const metadata: Metadata = { title: "Two-step verification", robots: { index: false, follow: false } };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const state = await getSessionState();
  if (state.status === "anonymous") redirect("/login");
  if (state.status === "ok" && state.staff.aal === "aal2") redirect(safeNext(next));
  return (
    <AuthShell title="Two-step verification" description="Open your authenticator app and enter the current 6-digit code for this account.">
      <MfaForm next={next} />
    </AuthShell>
  );
}
