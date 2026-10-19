import { expect, test, type Page } from "@playwright/test";
import { closeDb, resetRateLimits } from "./support/db";
import { totp } from "./support/totp";
import { PERSONAS, ensurePersona, freshContext, uiLogin } from "./support/users";

test.describe.configure({ mode: "serial" });

const p = PERSONAS.mfa;
let secret = "";

test.beforeAll(async () => { await ensurePersona(p); await resetRateLimits(); });
test.afterAll(async () => { await ensurePersona(p); await resetRateLimits(); await closeDb(); });

const alertOf = (page: Page) => page.locator("main").getByRole("alert").filter({ hasText: /\S/ }).first();

test("enrolment: scan-or-type setup, a wrong code is rejected, the right one turns it on", async ({ browser }) => {
  const ctx = await freshContext(browser); const page = await ctx.newPage();
  await uiLogin(page, p); await page.waitForURL(/\/admin\/dashboard/);
  await page.goto("/admin/security");
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /set up authenticator/i }).click();
  await expect(page.getByRole("img", { name: /QR code for your authenticator app/i })).toBeVisible();
  secret = (await page.locator("code").first().innerText()).replace(/\s+/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{16,64}$/);

  await page.getByLabel(/6-digit code from the app/i).fill("000000");
  await page.getByRole("button", { name: /turn on/i }).click();
  await expect(page.getByText("Incorrect or expired code.")).toBeVisible();

  await page.getByLabel(/6-digit code from the app/i).fill(totp(secret));
  await page.getByRole("button", { name: /turn on/i }).click();
  await expect(page.getByText(/an authenticator app is linked/i)).toBeVisible();
  await ctx.close();
});

test("a new sign-in now asks for the code, and a wrong code is refused", async ({ browser }) => {
  const ctx = await freshContext(browser); const page = await ctx.newPage();
  await uiLogin(page, p);
  await expect(page).toHaveURL(/\/login\/mfa/);
  await page.getByLabel(/6-digit code/i).fill("111111");
  await page.getByRole("button", { name: /verify and continue/i }).click();
  await expect(alertOf(page)).toContainText(/didn.t work/i);
  await expect(page).toHaveURL(/\/login\/mfa/);
  await ctx.close();
});

test("REGRESSION: a password-only session cannot skip the code by typing a staff URL or calling an API", async ({ browser }) => {
  const ctx = await freshContext(browser); const page = await ctx.newPage();
  await uiLogin(page, p);
  await expect(page).toHaveURL(/\/login\/mfa/);
  for (const path of ["/admin/dashboard", "/admin/security", "/admin/audit", "/admin/team", "/admin/products"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login\/mfa/);
  }
  for (const url of ["/api/admin/search?q=ab", "/api/admin/reports/export?kind=audit"]) {
    expect((await ctx.request.get(url)).status(), url).toBe(401);
  }
  // No staff content was ever served to this half-authenticated session.
  expect(await page.content()).not.toContain("Staff workspace");
  await ctx.close();
});

test("the correct code completes sign-in and unlocks the workspace", async ({ browser }) => {
  const ctx = await freshContext(browser); const page = await ctx.newPage();
  await uiLogin(page, p);
  await expect(page).toHaveURL(/\/login\/mfa/);
  await page.getByLabel(/6-digit code/i).fill(totp(secret));
  await page.getByRole("button", { name: /verify and continue/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  expect((await ctx.request.get("/api/admin/search?q=ab")).status()).toBe(200);
  await ctx.close();
});

test("the authenticator can be removed (needs a verified session) and sign-in no longer asks", async ({ browser }) => {
  const ctx = await freshContext(browser); const page = await ctx.newPage();
  await uiLogin(page, p);
  await page.getByLabel(/6-digit code/i).fill(totp(secret));
  await page.getByRole("button", { name: /verify and continue/i }).click();
  await page.waitForURL(/\/admin\/dashboard/);

  await page.goto("/admin/security");
  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: /turn off/i }).click();
  await expect(page.getByRole("button", { name: /set up authenticator/i })).toBeVisible();
  await ctx.close();

  const again = await freshContext(browser); const pg = await again.newPage();
  await uiLogin(pg, p);
  await expect(pg).toHaveURL(/\/admin\/dashboard/);
  await again.close();
});

test("the second-factor limiter slows guessing", async ({ browser }) => {
  // Enrol again, then burn the budget with wrong codes.
  const ctx = await freshContext(browser); const page = await ctx.newPage();
  await uiLogin(page, p); await page.waitForURL(/\/admin\/dashboard/);
  await page.goto("/admin/security");
  await page.getByRole("button", { name: /set up authenticator/i }).click();
  secret = (await page.locator("code").first().innerText()).replace(/\s+/g, "");
  await page.getByLabel(/6-digit code from the app/i).fill(totp(secret));
  await page.getByRole("button", { name: /turn on/i }).click();
  await expect(page.getByText(/an authenticator app is linked/i)).toBeVisible();
  await ctx.close();

  const c2 = await freshContext(browser); const pg = await c2.newPage();
  await uiLogin(pg, p);
  await expect(pg).toHaveURL(/\/login\/mfa/);
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) {
    await pg.getByLabel(/6-digit code/i).fill(String(100000 + i));
    await pg.getByRole("button", { name: /verify and continue/i }).click();
    await expect(alertOf(pg)).toBeVisible();
    limited = /too many attempts/i.test(await alertOf(pg).innerText());
  }
  expect(limited).toBe(true);
  // Even the right code is refused while throttled.
  await pg.getByLabel(/6-digit code/i).fill(totp(secret));
  await pg.getByRole("button", { name: /verify and continue/i }).click();
  await expect(alertOf(pg)).toContainText(/too many attempts/i);
  await c2.close();
});
