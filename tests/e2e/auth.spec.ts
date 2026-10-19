import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeDb, resetRateLimits } from "./support/db";
import { PASSWORD, PERSONAS, ensurePersona, freshContext, uiLogin, type Persona } from "./support/users";

test.afterAll(async () => { await resetRateLimits(); await closeDb(); });

const GENERIC = /We couldn.t sign you in with those details/;

async function fresh(browser: Browser) {
  const ctx = await freshContext(browser);
  return { ctx, page: await ctx.newPage() };
}
/** The visible form/page alert. Next.js also renders an (empty) role="alert" route announcer, so scope to <main>. */
const alertOf = (page: Page) => page.locator("main").getByRole("alert").filter({ hasText: /\S/ }).first();

test.describe("sign-in", () => {
  // The login limiter is real (10 per account per 15 min). Reset it so tests don't depend on how many ran before.
  test.beforeEach(async () => { await resetRateLimits(); });

  test("a staff member signs in with email and password and lands on the dashboard", async ({ browser }) => {
    const { ctx, page } = await fresh(browser);
    await uiLogin(page, PERSONAS.session);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await ctx.close();
  });

  test("wrong password and unknown email get the SAME generic message (no account enumeration)", async ({ browser }) => {
    const { ctx, page } = await fresh(browser);
    await uiLogin(page, PERSONAS.session, "definitely-the-wrong-password");
    const wrong = await alertOf(page).innerText();
    await uiLogin(page, { ...PERSONAS.session, email: "nobody-at-all@example.test" });
    const unknown = await alertOf(page).innerText();
    expect(wrong).toMatch(GENERIC);
    expect(unknown).toBe(wrong);
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  for (const key of ["nomember", "suspended"] as const) {
    test(`${key}: valid credentials but no active staff access is refused with the same generic message`, async ({ browser }) => {
      const { ctx, page } = await fresh(browser);
      await uiLogin(page, PERSONAS[key]);
      await expect(alertOf(page)).toContainText(GENERIC);
      await expect(page).toHaveURL(/\/login/);
      await page.goto("/admin/dashboard");
      await expect(page).toHaveURL(/\/login/); // and no session was left behind
      await ctx.close();
    });
  }

  test("a safe in-app destination is honoured after sign-in", async ({ browser }) => {
    const { ctx, page } = await fresh(browser);
    await page.goto("/login?next=%2Fadmin%2Faudit");
    await page.getByLabel(/^Work email/).fill(PERSONAS.session.email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin\/audit/);
    await ctx.close();
  });

  for (const evil of ["https://evil.example/phish", "//evil.example/phish", "/\\evil.example", "/adminx", "javascript:alert(1)"]) {
    test(`open redirect is refused: next=${evil}`, async ({ browser }) => {
      const { ctx, page } = await fresh(browser);
      await page.goto(`/login?next=${encodeURIComponent(evil)}`);
      await page.getByLabel(/^Work email/).fill(PERSONAS.session.email);
      await page.getByLabel(/^Password/).fill(PASSWORD);
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL(/\/admin\//);
      expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL ?? "http://localhost:3000").origin);
      expect(page.url()).not.toContain("evil.example");
      await ctx.close();
    });
  }

  test("the session cookie is httpOnly (script cannot read it) and the app keeps no tokens in storage", async ({ browser }) => {
    const { ctx, page } = await fresh(browser);
    await uiLogin(page, PERSONAS.session);
    await page.waitForURL(/\/admin\/dashboard/);
    const cookies = (await ctx.cookies()).filter((c) => c.name.startsWith("sb-"));
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies) {
      expect(c.httpOnly, c.name).toBe(true);
      expect(c.sameSite, c.name).toBe("Lax");
    }
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/sb-/);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(stored).not.toMatch(/access_token|refresh_token|eyJ/);
    await ctx.close();
  });

  test("sign-out ends this session, and the back button cannot reveal staff pages", async ({ browser }) => {
    const { ctx, page } = await fresh(browser);
    await uiLogin(page, PERSONAS.session);
    await page.waitForURL(/\/admin\/dashboard/);
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toHaveCount(0);
    await page.goto("/admin/audit");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Faudit/);
    await ctx.close();
  });

  test("signing out here does not sign the same person out on their other device", async ({ browser }) => {
    const a = await freshContext(browser); const b = await freshContext(browser);
    const pa = await a.newPage(); const pb = await b.newPage();
    await uiLogin(pa, PERSONAS.session); await pa.waitForURL(/\/admin\/dashboard/);
    await uiLogin(pb, PERSONAS.session); await pb.waitForURL(/\/admin\/dashboard/);
    await pa.getByRole("button", { name: /account menu/i }).click();
    await pa.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(pa).toHaveURL(/\/login/);
    await pb.goto("/admin/audit");
    await expect(pb).toHaveURL(/\/admin\/audit/);
    await a.close(); await b.close();
  });
});

test.describe("brute force and enumeration protection", () => {
  test("the login limiter answers repeated failures with a wait message, per account", async ({ browser }) => {
    await resetRateLimits();
    const { ctx, page } = await fresh(browser);
    let limited = false;
    for (let i = 0; i < 12 && !limited; i++) {
      await uiLogin(page, PERSONAS.nomember, `wrong-password-${i}`);
      const text = await alertOf(page).innerText();
      limited = /too many attempts/i.test(text);
    }
    expect(limited, "should have been throttled within 12 attempts").toBe(true);
    // Even the CORRECT password is refused while throttled: the limiter sits in front of the credential check.
    await uiLogin(page, PERSONAS.nomember);
    await expect(alertOf(page)).toContainText(/too many attempts/i);
    await ctx.close();
    await resetRateLimits();
  });

  test("password-reset request answers identically for a real and an unknown address", async ({ browser }) => {
    const answers: string[] = [];
    for (const email of [PERSONAS.session.email, "no-such-person@example.test"]) {
      const { ctx, page } = await fresh(browser);
      await page.goto("/reset-password");
      await page.getByLabel(/^Work email/).fill(email);
      await page.getByRole("button", { name: /send reset link/i }).click();
      await expect(page.getByText("Check your email")).toBeVisible();
      answers.push(await page.locator("main").innerText());
      await ctx.close();
    }
    expect(answers[0]).toBe(answers[1]);
  });

  test("a bogus or reused email link says so and exposes nothing", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=definitely-not-a-real-token-hash&type=recovery");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(alertOf(page)).toContainText(/expired or was already used|isn.t valid/i);
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/new password/i)).toHaveCount(0); // no session, so no set-password form
  });
});

test.describe("password change and other devices", () => {
  const p: Persona = PERSONAS.pwchange;
  const NEW = "e2e-A-Brand-New-Passphrase-42";

  // Every test starts from the known password, so order doesn't matter and the suite is repeatable.
  test.beforeEach(async () => { await ensurePersona(p); await resetRateLimits(); });

  test("changing the password revokes the person's other sessions but not this one", async ({ browser }) => {
    const a = await freshContext(browser); const b = await freshContext(browser);
    const pa = await a.newPage(); const pb = await b.newPage();
    await uiLogin(pa, p); await pa.waitForURL(/\/admin\/dashboard/);
    await uiLogin(pb, p); await pb.waitForURL(/\/admin\/dashboard/);

    await pa.goto("/admin/security");
    await pa.getByLabel(/^Current password/).fill("not-my-current-password");
    await pa.getByLabel(/^New password/).fill(NEW);
    await pa.getByLabel(/^Confirm new password/).fill(NEW);
    await pa.getByRole("button", { name: /update password/i }).click();
    await expect(pa.getByText(/current password isn.t right/i).first()).toBeVisible();

    await pa.getByLabel(/^Current password/).fill(PASSWORD);
    await pa.getByRole("button", { name: /update password/i }).click();
    await expect(pa.getByText(/password updated/i)).toBeVisible();

    await pa.goto("/admin/dashboard");
    await expect(pa).toHaveURL(/\/admin\/dashboard/); // this session survives
    await pb.goto("/admin/dashboard");
    await expect(pb, "the other device was signed out").toHaveURL(/\/login/);

    // The old password is dead, the new one works.
    const c = await freshContext(browser); const pc = await c.newPage();
    await uiLogin(pc, p, PASSWORD);
    await expect(alertOf(pc)).toContainText(GENERIC);
    await uiLogin(pc, p, NEW);
    await expect(pc).toHaveURL(/\/admin\/dashboard/);
    await a.close(); await b.close(); await c.close();
  });

  test("a weak or mismatched new password is rejected with a helpful message", async ({ browser }) => {
    const ctx = await freshContext(browser); const page = await ctx.newPage();
    await uiLogin(page, p); await page.waitForURL(/\/admin\/dashboard/);
    await page.goto("/admin/security");
    await page.getByLabel(/^Current password/).fill(PASSWORD);
    await page.getByLabel(/^New password/).fill("short");
    await page.getByLabel(/^Confirm new password/).fill("different");
    await page.getByRole("button", { name: /update password/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /at least 12 characters/i })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /don.t match/i })).toBeVisible();
    await ctx.close();
  });

  test("'Sign out other devices' ends other sessions and keeps this one", async ({ browser }) => {
    const a = await freshContext(browser); const b = await freshContext(browser);
    const pa = await a.newPage(); const pb = await b.newPage();
    await uiLogin(pa, p); await pa.waitForURL(/\/admin\/dashboard/);
    await uiLogin(pb, p); await pb.waitForURL(/\/admin\/dashboard/);
    await pa.goto("/admin/security");
    await pa.getByRole("button", { name: /sign out other devices/i }).click();
    await expect(pa.getByText(/signed out of all other devices/i)).toBeVisible();
    await pb.goto("/admin/dashboard");
    await expect(pb).toHaveURL(/\/login/);
    await pa.goto("/admin/dashboard");
    await expect(pa).toHaveURL(/\/admin\/dashboard/);
    await a.close(); await b.close();
  });
});
