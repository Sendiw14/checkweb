import "server-only";
import { cache } from "react";
import { appPool } from "@/server/db/pool";
import { getEnv } from "@/server/env";
import { log } from "@/server/logger";
import { PRIVILEGED_ROLES } from "@/server/auth/permissions";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import type { Role } from "@/server/domain/enums";

export type Staff = {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  /** Authenticator assurance level of the current session. */
  aal: "aal1" | "aal2";
  mfaEnrolled: boolean;
  /** True when the session still owes a second factor: one is enrolled, or policy requires it for this role. */
  mfaRequired: boolean;
};

export type SessionState =
  | { status: "anonymous" }
  | { status: "no_membership" | "suspended"; userId: string }
  | { status: "ok"; staff: Staff };

/**
 * Resolves the caller from the Supabase session AND the admin_memberships table.
 * Auth proves who they are; membership decides whether (and as what) they may enter.
 * Both are re-checked on every request, so suspending or demoting someone takes effect
 * immediately, regardless of how long their JWT would otherwise be valid.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(); // validated by the Auth server, not just decoded
  if (error || !data.user) return { status: "anonymous" };

  const { rows } = await appPool().query<{ role: Role; status: "active" | "suspended"; display_name: string; email: string }>(
    "select role, status, display_name, email from public.admin_memberships where user_id = $1",
    [data.user.id],
  );
  const m = rows[0];
  if (!m) return { status: "no_membership", userId: data.user.id };
  if (m.status !== "active") return { status: "suspended", userId: data.user.id };

  let aal: "aal1" | "aal2" = "aal1";
  let mfaEnrolled = false;
  try {
    const { data: lvl } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = lvl?.currentLevel === "aal2" ? "aal2" : "aal1";
    mfaEnrolled = lvl?.nextLevel === "aal2" || aal === "aal2";
  } catch (err) {
    log.warn("auth.aal_lookup_failed", { code: (err as { code?: string }).code });
  }
  // An enrolled factor is always enforced (a password-only session must not skip /login/mfa just by
  // typing an admin URL). Policy additionally forces privileged roles to enrol in the first place.
  const policyRequires = getEnv().REQUIRE_MFA_FOR_PRIVILEGED && PRIVILEGED_ROLES.includes(m.role);
  const mfaRequired = aal !== "aal2" && (mfaEnrolled || policyRequires);
  return {
    status: "ok",
    staff: { userId: data.user.id, email: m.email, displayName: m.display_name || m.email, role: m.role, aal, mfaEnrolled, mfaRequired },
  };
});

export async function getStaff(): Promise<Staff | null> {
  const s = await getSessionState();
  return s.status === "ok" ? s.staff : null;
}
