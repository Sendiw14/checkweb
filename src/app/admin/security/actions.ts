"use server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/server/audit";
import { signedIn, type ActionResult } from "@/server/auth/guards";
import { PRIVILEGED_ROLES } from "@/server/auth/permissions";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { getEnv } from "@/server/env";
import { log } from "@/server/logger";
import { qrPath } from "@/server/qr";
import { hit } from "@/server/ratelimit";
import { getSiteSettings } from "@/server/settings";
import { changePasswordSchema, mfaCodeSchema } from "@/lib/auth-schema";

export type TotpEnrolment = { factorId: string; secret: string; qr: { size: number; d: string } };

const tooMany = (seconds: number): ActionResult<never> => ({
  ok: false, code: "failed",
  error: `Too many attempts. Please wait about ${Math.max(1, Math.ceil(seconds / 60))} minute(s) and try again.`,
});

/** Starts authenticator enrolment. Any half-finished enrolment is discarded first so factors don't pile up. */
export async function enrollTotp(): Promise<ActionResult<TotpEnrolment>> {
  return signedIn(async (staff) => {
    const rl = await hit(`mfa-enrol:${staff.userId}`, 900, 10);
    if (!rl.allowed) return tooMany(rl.retryAfterSeconds);
    const supabase = await createSupabaseServerClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    if (factors?.totp.some((f) => f.status === "verified")) {
      return { ok: false, code: "conflict", error: "An authenticator is already set up. Remove it first if you want to replace it." };
    }
    for (const f of factors?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { companyName } = await getSiteSettings();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: companyName,
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    if (error || !data) {
      log.warn("auth.mfa_enrol_failed", { code: (error as { code?: string } | null)?.code });
      return { ok: false, code: "failed", error: "We couldn't start setup. Please try again." };
    }
    return { ok: true, data: { factorId: data.id, secret: data.totp.secret, qr: qrPath(data.totp.uri, "M") } };
  });
}

/** Confirms the first code from the authenticator app; the session is upgraded to aal2 on success. */
export async function verifyEnrollment(factorId: string, input: unknown): Promise<ActionResult> {
  return signedIn(async (staff) => {
    const parsed = mfaCodeSchema.safeParse(input);
    if (!parsed.success || !/^[0-9a-f-]{36}$/.test(factorId)) {
      return { ok: false, code: "validation", error: "Check the code.", fieldErrors: { code: parsed.success ? "Start setup again." : parsed.error.issues[0]!.message } };
    }
    const rl = await hit(`mfa:${staff.userId}`, 300, 8);
    if (!rl.allowed) return tooMany(rl.retryAfterSeconds);
    const supabase = await createSupabaseServerClient();
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr || !ch) return { ok: false, code: "failed", error: "We couldn't check that code. Start setup again." };
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: parsed.data.code });
    if (error) {
      await writeAudit(staff, { action: "auth.mfa_enrol_failed", targetType: "user", targetId: staff.userId }).catch(() => {});
      return { ok: false, code: "validation", error: "That code didn't match. Codes change every 30 seconds; try the latest one.", fieldErrors: { code: "Incorrect or expired code." } };
    }
    await writeAudit(staff, { action: "auth.mfa_enrolled", targetType: "user", targetId: staff.userId });
    revalidatePath("/admin", "layout");
    return { ok: true };
  });
}

/** Removes the authenticator. Needs a second-factor session, and is refused where policy requires MFA. */
export async function removeTotp(): Promise<ActionResult> {
  return signedIn(async (staff) => {
    if (getEnv().REQUIRE_MFA_FOR_PRIVILEGED && PRIVILEGED_ROLES.includes(staff.role)) {
      return { ok: false, code: "forbidden", error: "Two-step verification is required for your role, so it can't be turned off." };
    }
    if (staff.aal !== "aal2") return { ok: false, code: "forbidden", error: "Verify with your authenticator before removing it." };
    const supabase = await createSupabaseServerClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp.find((f) => f.status === "verified");
    if (!totp) return { ok: true };
    const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
    if (error) return { ok: false, code: "failed", error: "We couldn't remove it. Please try again." };
    await writeAudit(staff, { action: "auth.mfa_removed", targetType: "user", targetId: staff.userId });
    revalidatePath("/admin", "layout");
    return { ok: true };
  });
}

export async function changePassword(input: unknown): Promise<ActionResult> {
  return signedIn(async (staff) => {
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: "validation", error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
    }
    const rl = await hit(`pwchange:${staff.userId}`, 900, 6);
    if (!rl.allowed) return tooMany(rl.retryAfterSeconds);

    // Prove knowledge of the current password with a throwaway client, so the real session is untouched.
    const env = getEnv();
    const probe = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: probed, error: probeErr } = await probe.auth.signInWithPassword({ email: staff.email, password: parsed.data.current });
    if (probeErr || !probed.session) {
      await writeAudit(staff, { action: "auth.password_change_failed", targetType: "user", targetId: staff.userId, metadata: { reason: "current_password" } }).catch(() => {});
      return { ok: false, code: "validation", error: "Your current password isn't right.", fieldErrors: { current: "Incorrect password." } };
    }
    await probe.auth.signOut({ scope: "local" }); // revoke only the probe session, never the caller's

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      const weak = /weak|short|password|pwned|known/i.test(error.message);
      return { ok: false, code: "validation", error: weak ? "That password isn't strong enough. Try a longer one." : "We couldn't update your password. Please try again.", fieldErrors: weak ? { password: "Choose a longer or less common password." } : undefined };
    }
    await supabase.auth.signOut({ scope: "others" });
    await writeAudit(staff, { action: "auth.password_changed", targetType: "user", targetId: staff.userId });
    return { ok: true };
  });
}

/** Ends every session except this one (lost laptop, shared computer). */
export async function signOutOtherDevices(): Promise<ActionResult> {
  return signedIn(async (staff) => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) return { ok: false, code: "failed", error: "We couldn't sign out other devices. Please try again." };
    await writeAudit(staff, { action: "auth.sessions_revoked", targetType: "user", targetId: staff.userId });
    return { ok: true };
  });
}
