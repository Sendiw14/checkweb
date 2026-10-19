import "server-only";
import { redirect } from "next/navigation";
import { can, type Permission } from "@/server/auth/permissions";
import { getSessionState, type Staff } from "@/server/auth/session";

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission | "authenticated") {
    super(`Forbidden: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** For pages and layouts: redirects anonymous callers; authenticated-but-unauthorised ones land on the access-denied page. */
export async function requireStaff(opts: { next?: string; allowMfaPending?: boolean } = {}): Promise<Staff> {
  const state = await getSessionState();
  if (state.status === "anonymous") redirect(`/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}`);
  if (state.status !== "ok") redirect(`/login?error=${state.status === "suspended" ? "suspended" : "no_access"}`);
  if (state.staff.mfaRequired && !opts.allowMfaPending) redirect(state.staff.mfaEnrolled ? "/login/mfa" : "/admin/security?required=1");
  return state.staff;
}

export async function requirePermission(permission: Permission, opts: { next?: string } = {}): Promise<Staff> {
  const staff = await requireStaff(opts);
  if (!can(staff.role, permission)) redirect(`/admin/access-denied?need=${encodeURIComponent(permission)}`);
  return staff;
}

/**
 * For server actions and route handlers, where redirects are the wrong response:
 * throws ForbiddenError, which `authorized()` below turns into a typed result.
 */
export async function assertPermission(permission: Permission): Promise<Staff> {
  const state = await getSessionState();
  if (state.status !== "ok") throw new ForbiddenError("authenticated");
  if (state.staff.mfaRequired) throw new ForbiddenError("authenticated");
  if (!can(state.staff.role, permission)) throw new ForbiddenError(permission);
  return state.staff;
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>>; code?: "forbidden" | "validation" | "conflict" | "unavailable" | "failed" };

/** Wraps a server action body: authorisation first, then the work, with safe error mapping. */
export async function authorized<T>(permission: Permission, run: (staff: Staff) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const staff = await assertPermission(permission);
    return await run(staff);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, code: "forbidden", error: "You don't have permission to do that." } as ActionResult<T>;
    }
    throw err;
  }
}
