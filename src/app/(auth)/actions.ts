"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { appPool } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { getSessionState } from "@/server/auth/session";
import { safeNext } from "@/server/auth/safe-next";
import { getEnv } from "@/server/env";
import { describeClient } from "@/server/http/client-info";
import { log } from "@/server/logger";
import { LIMITS, hit } from "@/server/ratelimit";
import { loginSchema, mfaCodeSchema, newPasswordSchema, resetRequestSchema } from "@/lib/auth-schema";

export type AuthResult = { ok: false; error: string; fieldErrors?: Record<string, string> } | { ok: true };

const GENERIC_LOGIN_ERROR = "We couldn't sign you in with those details. Check them and try again.";
const hashEmail = (email: string) => createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);

async function clientKey() {
  return describeClient(await headers(), getEnv().NETWORK_HASH_PEPPER).rateKey;
}

function tooMany(seconds: number): AuthResult {
  const mins = Math.max(1, Math.ceil(seconds / 60));
  return { ok: false, error: `Too many attempts. Please wait about ${mins} minute${mins === 1 ? "" : "s"} and try again.` };
}

export async function signIn(input: unknown, next?: string): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const { email, password } = parsed.data;

  const key = await clientKey();
  const [byIp, byEmail] = await Promise.all([
    hit(`login:ip:${key}`, LIMITS.login.window, LIMITS.login.limit),
    hit(`login:email:${hashEmail(email)}`, LIMITS.login.window, LIMITS.login.limit),
  ]);
  if (!byIp.allowed || !byEmail.allowed) return tooMany(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await writeAudit(null, { action: "auth.login_failed", metadata: { emailHash: hashEmail(email) } }).catch(() => {});
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  // Authentication succeeded; authorisation is a separate question.
  const { rows } = await appPool().query<{ role: string; status: string; email: string }>(
    "select role, status, email from public.admin_memberships where user_id = $1",
    [data.user.id],
  );
  const m = rows[0];
  if (!m || m.status !== "active") {
    await supabase.auth.signOut({ scope: "local" }); // only the session just created
    await writeAudit(null, { action: "auth.login_denied", targetType: "user", targetId: data.user.id, metadata: { reason: m ? "suspended" : "no_membership" } }).catch(() => {});
    return { ok: false, error: GENERIC_LOGIN_ERROR }; // same message: don't confirm valid credentials to non-staff
  }
  await writeAudit({ userId: data.user.id, email: m.email, role: m.role as never }, { action: "auth.login" });

  const { data: lvl } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const target = safeNext(next);
  if (lvl?.nextLevel === "aal2" && lvl.currentLevel !== "aal2") redirect(`/login/mfa?next=${encodeURIComponent(target)}`);
  redirect(target);
}

export async function verifyMfa(input: unknown, next?: string): Promise<AuthResult> {
  const parsed = mfaCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the code.", fieldErrors: { code: parsed.error.issues[0]!.message } };
  const state = await getSessionState();
  if (state.status === "anonymous") redirect("/login");

  const userId = "staff" in state ? state.staff.userId : state.userId;
  const rl = await hit(`mfa:${userId}`, 300, 8);
  if (!rl.allowed) return tooMany(rl.retryAfterSeconds);

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp.find((f) => f.status === "verified");
  if (!totp) return { ok: false, error: "No authenticator is set up for this account." };
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
  if (chErr || !ch) return { ok: false, error: "We couldn't start the check. Please try again." };
  const { error } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code: parsed.data.code });
  if (error) {
    await writeAudit("staff" in state ? state.staff : null, { action: "auth.mfa_failed", targetType: "user", targetId: userId }).catch(() => {});
    return { ok: false, error: "That code didn't work. Codes change every 30 seconds; try the latest one.", fieldErrors: { code: "Incorrect or expired code." } };
  }
  redirect(safeNext(next));
}

/** Always answers the same way, so it can't be used to discover which emails belong to staff. */
export async function requestPasswordReset(input: unknown): Promise<AuthResult> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: { email: parsed.error.issues[0]!.message } };
  const key = await clientKey();
  const [a, b] = await Promise.all([
    hit(`reset:ip:${key}`, LIMITS.passwordReset.window, LIMITS.passwordReset.limit),
    hit(`reset:email:${hashEmail(parsed.data.email)}`, LIMITS.passwordReset.window, 3),
  ]);
  if (!a.allowed || !b.allowed) return { ok: true }; // silently throttle; same response
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${getEnv().PUBLIC_SITE_URL}/auth/confirm` });
  } catch (err) {
    log.warn("auth.reset_request_failed", { code: (err as { code?: string }).code });
  }
  return { ok: true };
}

/** Exchanges the emailed token for a session (POST, so mail scanners that prefetch links can't burn it). */
export async function confirmEmailToken(tokenHash: string, type: string): Promise<AuthResult> {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash) || !["recovery", "invite", "email"].includes(type)) return { ok: false, error: "This link isn't valid." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "recovery" | "invite" | "email" });
  if (error) return { ok: false, error: "This link has expired or was already used. Request a new one." };
  redirect("/reset-password"); // recovery and invite links both end at choosing a password
}

export async function setNewPassword(input: unknown): Promise<AuthResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Your link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const weak = /weak|short|password/i.test(error.message);
    return { ok: false, error: weak ? "That password isn't strong enough. Try a longer one." : "We couldn't update your password. Please try again." };
  }
  await writeAudit({ userId: data.user.id, email: data.user.email ?? "", role: null as never }, { action: "auth.password_set" }).catch(() => {});
  await supabase.auth.signOut({ scope: "global" }); // end every session; sign in again with the new password
  redirect("/login?reset=1");
}

export async function signOutAction() {
  const state = await getSessionState();
  const supabase = await createSupabaseServerClient();
  if (state.status === "ok") await writeAudit(state.staff, { action: "auth.logout" }).catch(() => {});
  await supabase.auth.signOut({ scope: "local" }); // this device only; "Sign out other devices" on the security page is the explicit global option
  redirect("/login");
}
