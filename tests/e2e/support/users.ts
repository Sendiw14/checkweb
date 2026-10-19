import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { Role } from "@/server/domain/enums";
import { db } from "./db";
import { E2E } from "./env";

export const PASSWORD = "e2e-Correct-Horse-Battery-Staple-9";

export type Persona = { key: string; email: string; role: Role | null; status?: "active" | "suspended"; name: string };

export const PERSONAS = {
  owner: { key: "owner", email: "e2e-owner@example.test", role: "owner", name: "E2E Owner" },
  admin: { key: "admin", email: "e2e-admin@example.test", role: "admin", name: "E2E Admin" },
  production_operator: { key: "production_operator", email: "e2e-production@example.test", role: "production_operator", name: "E2E Production" },
  warehouse_operator: { key: "warehouse_operator", email: "e2e-warehouse@example.test", role: "warehouse_operator", name: "E2E Warehouse" },
  support_agent: { key: "support_agent", email: "e2e-support@example.test", role: "support_agent", name: "E2E Support" },
  auditor: { key: "auditor", email: "e2e-auditor@example.test", role: "auditor", name: "E2E Auditor" },
  // Dedicated to specs that sign out, change the password or revoke sessions, so they can't invalidate the shared role sessions.
  session: { key: "session", email: "e2e-session@example.test", role: "auditor", name: "E2E Session" },
  pwchange: { key: "pwchange", email: "e2e-pwchange@example.test", role: "support_agent", name: "E2E Password" },
  mfa: { key: "mfa", email: "e2e-mfa@example.test", role: "admin", name: "E2E MFA" },
  suspended: { key: "suspended", email: "e2e-suspended@example.test", role: "admin", status: "suspended", name: "E2E Suspended" },
  nomember: { key: "nomember", email: "e2e-nomember@example.test", role: null, name: "E2E Nobody" },
} as const satisfies Record<string, Persona>;
export type PersonaKey = keyof typeof PERSONAS;
export const ROLE_KEYS = ["owner", "admin", "production_operator", "warehouse_operator", "support_agent", "auditor"] as const satisfies readonly PersonaKey[];

export const statePath = (key: string) => join(E2E.stateDir, `state-${key}.json`);

async function adminApi(path: string, init: RequestInit) {
  const key = E2E.serviceKey();
  const res = await fetch(`${E2E.supabaseUrl()}/auth/v1${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  return res;
}

/** Idempotent: creates the auth user (or resets its password) and aligns its membership. */
export async function ensurePersona(p: Persona) {
  const existing = (await db().query("select id from auth.users where email = $1", [p.email])).rows[0] as { id: string } | undefined;
  let id = existing?.id;
  if (!id) {
    const res = await adminApi("/admin/users", { method: "POST", body: JSON.stringify({ email: p.email, password: PASSWORD, email_confirm: true, user_metadata: { name: p.name } }) });
    if (!res.ok) throw new Error(`creating ${p.email} failed: ${res.status} ${await res.text()}`);
    id = ((await res.json()) as { id: string }).id;
  } else {
    const res = await adminApi(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify({ password: PASSWORD, email_confirm: true }) });
    if (!res.ok) throw new Error(`resetting ${p.email} failed: ${res.status}`);
  }
  await db().query("delete from auth.mfa_factors where user_id = $1", [id]); // every run starts without an authenticator
  if (p.role) {
    await db().query(
      `insert into public.admin_memberships (user_id, email, role, status, display_name) values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set role = excluded.role, status = excluded.status, display_name = excluded.display_name`,
      [id, p.email, p.role, p.status ?? "active", p.name]);
  } else {
    await db().query("delete from public.admin_memberships where user_id = $1", [id]);
  }
  return id;
}

let ipCounter = 10;
/** Each login gets its own fake client address so the (real) per-IP login limiter doesn't couple tests. */
export const freshIp = () => `198.51.100.${(ipCounter = (ipCounter % 240) + 1)}`;

export async function uiLogin(page: Page, p: Persona, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/^Work email/).fill(p.email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

export function ensureStateDir() { mkdirSync(E2E.stateDir, { recursive: true }); }

/** A browser context with its own fake client address, so the (real) per-IP login limiter doesn't couple tests. */
export async function freshContext(browser: import("@playwright/test").Browser, opts: { storageState?: string } = {}) {
  return browser.newContext({ baseURL: E2E.baseURL, extraHTTPHeaders: { "x-forwarded-for": freshIp() }, ...opts });
}
