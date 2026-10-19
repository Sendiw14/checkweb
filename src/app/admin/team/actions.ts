"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { appPool, withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { canManageRole } from "@/server/auth/permissions";
import { createSupabaseAdminClient } from "@/server/auth/supabase";
import { mapDbError, validationFailure } from "@/server/action-utils";
import { getEnv } from "@/server/env";
import { log } from "@/server/logger";
import { inviteSchema } from "@/lib/schemas/team";
import { ROLES, type Role } from "@/server/domain/enums";

const refresh = () => revalidatePath("/admin/team");
const linkFor = (hashed: string, type: "invite" | "recovery") => `${getEnv().PUBLIC_SITE_URL}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=${type}`;

/**
 * Creates the person's sign-in identity and membership, and returns a one-time setup link.
 * The link is shown to the inviter once and is never stored (the audit log records only that it was made).
 */
export async function inviteStaff(input: unknown): Promise<ActionResult<{ link: string; email: string }>> {
  return authorized<{ link: string; email: string }>("team.manage", async (staff) => {
    const p = inviteSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    const { email, displayName, role } = p.data;
    if (!canManageRole(staff.role, role)) return { ok: false, code: "forbidden", error: `Your role can't grant the ${role.replace("_", " ")} role.`, fieldErrors: { role: "You can't grant this role." } };

    const exists = await appPool().query("select 1 from public.admin_memberships where email = $1", [email]);
    if (exists.rowCount) return { ok: false, code: "conflict", error: "That person already has access.", fieldErrors: { email: "Already a member of the team." } };

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { display_name: displayName } } });
    if (error || !data?.user || !data.properties?.hashed_token) {
      log.warn("team.invite_failed", { message: error?.message });
      return { ok: false, code: "conflict", error: /already|registered|exists/i.test(error?.message ?? "") ? "A login for that email already exists. Ask an owner to add a membership for it, or use a different address." : "We couldn't create that login. Try again." };
    }
    try {
      await withTransaction(async (c) => {
        await c.query("insert into public.admin_memberships (user_id, email, display_name, role, invited_by) values ($1, $2, $3, $4, $5)", [data.user.id, email, displayName, role, staff.userId]);
        await writeAudit(staff, { action: "team.invite", targetType: "user", targetId: data.user.id, metadata: { email, role } }, c);
      });
    } catch (err) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {}); // never leave a login with no membership
      return mapDbError(err);
    }
    refresh();
    return { ok: true, data: { link: linkFor(data.properties.hashed_token, "invite"), email } };
  });
}

/** A fresh setup/recovery link for someone who lost theirs. Shown once. */
export async function createAccessLink(userId: string): Promise<ActionResult<{ link: string }>> {
  return authorized<{ link: string }>("team.manage", async (staff) => {
    const m = (await appPool().query<{ email: string; role: Role }>("select email, role from public.admin_memberships where user_id = $1", [userId])).rows[0];
    if (!m) return { ok: false, code: "failed", error: "That person is no longer on the team." };
    if (userId === staff.userId) return { ok: false, code: "forbidden", error: "Use “Forgot your password?” for your own account." };
    if (!canManageRole(staff.role, m.role)) return { ok: false, code: "forbidden", error: "You can't manage this person." };
    const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({ type: "recovery", email: m.email });
    if (error || !data?.properties?.hashed_token) return { ok: false, code: "failed", error: "We couldn't create a link. Try again." };
    await writeAudit(staff, { action: "team.access_link", targetType: "user", targetId: userId }, appPool());
    return { ok: true, data: { link: linkFor(data.properties.hashed_token, "recovery") } };
  });
}

export async function changeRole(userId: string, role: unknown): Promise<ActionResult> {
  return authorized("team.manage", async (staff) => {
    const r = z.enum(ROLES).safeParse(role);
    if (!r.success) return { ok: false, code: "validation", error: "Choose a role." };
    if (userId === staff.userId) return { ok: false, code: "forbidden", error: "You can't change your own role. Ask another owner or administrator." };
    try {
      const res = await withTransaction(async (c) => {
        const cur = (await c.query<{ role: Role; email: string }>("select role, email from public.admin_memberships where user_id = $1 for update", [userId])).rows[0];
        if (!cur) return "That person is no longer on the team.";
        if (!canManageRole(staff.role, cur.role) || !canManageRole(staff.role, r.data)) return "Your role can't make that change.";
        await c.query("update public.admin_memberships set role = $2 where user_id = $1", [userId, r.data]);
        await writeAudit(staff, { action: "team.role_change", targetType: "user", targetId: userId, metadata: { email: cur.email, from: cur.role, to: r.data } }, c);
        return null;
      });
      if (res) return { ok: false, code: "forbidden", error: res };
      refresh();
      return { ok: true };
    } catch (err) { return mapDbError(err); } // includes "cannot remove, demote or suspend the last active owner"
  });
}

export async function setMemberStatus(userId: string, status: "active" | "suspended"): Promise<ActionResult> {
  return authorized("team.manage", async (staff) => {
    if (userId === staff.userId) return { ok: false, code: "forbidden", error: "You can't suspend your own account." };
    try {
      const res = await withTransaction(async (c) => {
        const cur = (await c.query<{ role: Role; email: string }>("select role, email from public.admin_memberships where user_id = $1 for update", [userId])).rows[0];
        if (!cur) return "That person is no longer on the team.";
        if (!canManageRole(staff.role, cur.role)) return "Your role can't manage this person.";
        await c.query("update public.admin_memberships set status = $2 where user_id = $1", [userId, status]);
        await writeAudit(staff, { action: status === "suspended" ? "team.suspend" : "team.reactivate", targetType: "user", targetId: userId, metadata: { email: cur.email } }, c);
        return null;
      });
      if (res) return { ok: false, code: "forbidden", error: res };
      // Membership is checked on every request, so access ends immediately. Also stop the login from refreshing tokens.
      await createSupabaseAdminClient().auth.admin.updateUserById(userId, { ban_duration: status === "suspended" ? "876000h" : "none" }).catch((e) => log.warn("team.ban_failed", { message: e?.message }));
      refresh();
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}
