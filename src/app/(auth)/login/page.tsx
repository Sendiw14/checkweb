import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionState } from "@/server/auth/session";
import { safeNext } from "@/server/auth/safe-next";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reset?: string }> }) {
  const sp = await searchParams;
  const state = await getSessionState();
  if (state.status === "ok" && !state.staff.mfaRequired) redirect(safeNext(sp.next));
  const notice = sp.reset
    ? { tone: "success" as const, text: "Your password has been changed. Sign in with the new one." }
    : sp.error === "suspended" || sp.error === "no_access"
      ? { tone: "danger" as const, text: "This account doesn't have access to the staff area. Ask an owner or administrator." }
      : sp.next
        ? { tone: "info" as const, text: "Please sign in to continue." }
        : null;
  return (
    <AuthShell title="Staff sign in" description="Use your individual work account. Shared logins aren't allowed.">
      <LoginForm next={sp.next} notice={notice} />
    </AuthShell>
  );
}
