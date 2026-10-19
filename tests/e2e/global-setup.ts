import { chromium, type FullConfig } from "@playwright/test";
import { closeDb, resetRateLimits } from "./support/db";
import { E2E } from "./support/env";
import { PERSONAS, ROLE_KEYS, ensurePersona, ensureStateDir, freshIp, statePath, uiLogin } from "./support/users";

/**
 * Creates one real Supabase Auth user per role (plus a suspended user, a user without membership and an
 * MFA user), then signs each role in through the real login form once and saves the session. Specs that
 * need "a signed-in X" reuse that session, so we don't hammer the login limiter.
 */
export default async function globalSetup(_config: FullConfig) {
  ensureStateDir();
  for (const p of Object.values(PERSONAS)) await ensurePersona(p);
  await resetRateLimits();

  const browser = await chromium.launch();
  try {
    for (const key of ROLE_KEYS) {
      const ctx = await browser.newContext({ baseURL: E2E.baseURL, extraHTTPHeaders: { "x-forwarded-for": freshIp() } });
      const page = await ctx.newPage();
      await uiLogin(page, PERSONAS[key]);
      await page.waitForURL(/\/admin\//, { timeout: 30_000 });
      await ctx.storageState({ path: statePath(key) });
      await ctx.close();
    }
  } finally {
    await browser.close();
    await closeDb();
  }
}
