import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm, ResetRequestForm } from "@/components/auth/reset-forms";
import { createSupabaseServerClient } from "@/server/auth/supabase";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage() {
  // A recovery/invite link (see /auth/confirm) leaves the person with a short-lived session:
  // show the "choose a new password" step. Otherwise show the request step.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? (
    <AuthShell title="Choose a new password" description="This signs you out of every device afterwards, then you sign in with the new password.">
      <NewPasswordForm />
    </AuthShell>
  ) : (
    <AuthShell title="Reset your password" description="Enter your work email and we'll send a link to set a new password.">
      <ResetRequestForm />
    </AuthShell>
  );
}
