import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmTokenForm } from "@/components/auth/reset-forms";

export const metadata: Metadata = { title: "Confirm", robots: { index: false, follow: false } };

/**
 * Email links land here. The token is only exchanged when the person presses the button
 * (a POST), so link scanners that pre-fetch URLs cannot consume a single-use token.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash, type = "recovery" } = await searchParams;
  const invite = type === "invite";
  return (
    <AuthShell title={invite ? "Welcome. Set up your account" : "Continue to reset your password"} description={invite ? "You've been invited to the staff workspace. Continue to choose a password." : "Press continue to choose a new password."}>
      {token_hash ? <ConfirmTokenForm tokenHash={token_hash} type={type} /> : <p className="text-body">This link is incomplete. Request a new one from the sign-in page.</p>}
    </AuthShell>
  );
}
