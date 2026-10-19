import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeDb, db, resetRateLimits } from "./support/db";
import { freshContext, statePath, uiLogin } from "./support/users";

/**
 * Onboarding and access control of colleagues, through the real Supabase Auth admin API and the real UI:
 * invite → one-time link → choose a password → sign in with the assigned role → role change and suspension
 * take effect on the very next request.
 */
test.describe.configure({ mode: "serial" });

const tag = randomUUID().replace(/-/g, "").slice(0, 8);
const invitee = { name: `E2E Invitee ${tag}`, email: `e2e-invitee-${tag}@example.test`, password: `e2e-Invitee-Passphrase-${tag}` };
let link = "";

test.beforeAll(async () => { await resetRateLimits(); });
test.afterAll(async () => {
  await db().query("delete from auth.users where email = $1", [invitee.email]); // membership cascades
  await resetRateLimits();
  await closeDb();
});

const navLinks = (page: Page) => page.getByRole("navigation", { name: "Admin" }).first().getByRole("link").allInnerTexts().then((t) => t.map((x) => x.trim()).sort());
const alertOf = (page: Page) => page.locator("main").getByRole("alert").filter({ hasText: /\S/ }).first();

async function inviteeContext(browser: Browser) {
  const ctx = await freshContext(browser);
  const page = await ctx.newPage();
  await uiLogin(page, { key: "invitee", email: invitee.email, role: "support_agent", name: invitee.name }, invitee.password);
  await page.waitForURL(/\/admin\/dashboard/); // sign-in is a redirect; don't navigate before it has finished
  return { ctx, page };
}

test("an owner invites a colleague and gets a one-time link that is shown once", async ({ browser }) => {
  const ctx = await freshContext(browser, { storageState: statePath("owner") }); const page = await ctx.newPage();
  await page.goto("/admin/team");
  await page.getByRole("button", { name: /invite someone/i }).click();
  await page.getByLabel(/^Full name/).fill(invitee.name);
  await page.getByLabel(/^Work email/).fill(invitee.email);
  await page.getByRole("combobox", { name: /role/i }).click();
  await page.getByRole("option", { name: "Support agent" }).click();
  await page.getByRole("button", { name: /create invitation/i }).click();
  await expect(page.getByText(/copy this link now/i)).toBeVisible();
  link = (await page.locator('code[title="Setup link"]').textContent())!.trim();
  expect(link).toMatch(/\/auth\/confirm\?token_hash=[A-Za-z0-9_-]+&type=invite$/);
  const m = (await db().query("select role, status, display_name from public.admin_memberships where email = $1", [invitee.email])).rows[0];
  expect(m).toMatchObject({ role: "support_agent", status: "active", display_name: invitee.name });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("row", { name: new RegExp(invitee.email) })).toBeVisible();
  const audit = (await db().query("select actor_role, metadata::text m from public.audit_logs where action = 'team.invite' order by id desc limit 1")).rows[0];
  expect(audit.actor_role).toBe("owner");
  expect(audit.m).not.toContain("token_hash"); // the link is never written to the audit log
  await ctx.close();
});

test("opening the link is harmless: a mail scanner that pre-fetches it cannot consume it", async ({ browser, request }) => {
  for (let i = 0; i < 3; i++) expect((await request.get(link)).status()).toBe(200); // GET only reads the page
  const ctx = await freshContext(browser); const page = await ctx.newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/set up your account/i);
  await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
  await ctx.close();
});

test("the colleague chooses a password; a weak one is refused; the link then works exactly once", async ({ browser }) => {
  const ctx = await freshContext(browser); const page = await ctx.newPage();
  await page.goto(link);
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page).toHaveURL(/\/reset-password/);

  await page.getByLabel(/^New password/).fill("short");
  await page.getByLabel(/^Repeat the new password/).fill("short");
  await page.getByRole("button", { name: /set password/i }).click();
  await expect(page.getByText(/at least 12 characters/i).first()).toBeVisible();

  await page.getByLabel(/^New password/).fill(invitee.password);
  await page.getByLabel(/^Repeat the new password/).fill(invitee.password);
  await page.getByRole("button", { name: /set password/i }).click();
  await expect(page).toHaveURL(/\/login\?reset=1/);
  await ctx.close();

  const again = await freshContext(browser); const p2 = await again.newPage();
  await p2.goto(link);
  await p2.getByRole("button", { name: /continue/i }).click();
  await expect(alertOf(p2)).toContainText(/expired or was already used|isn.t valid/i);
  await again.close();
});

test("they sign in with the role they were given, and see only what that role allows", async ({ browser }) => {
  const { ctx, page } = await inviteeContext(browser);
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  expect(await navLinks(page)).toEqual(["Batches", "Dashboard", "Investigations", "Part units", "Products", "Recalls", "Scan activity", "Support cases"]);
  await page.goto("/admin/team");
  await expect(page).toHaveURL(/\/admin\/access-denied/);
  await ctx.close();
});

test("a role change takes effect on the person's very next request, with no re-login", async ({ browser }) => {
  const { ctx, page } = await inviteeContext(browser);
  await page.goto("/admin/audit");
  await expect(page, "before the change, a support agent cannot read the audit log").toHaveURL(/\/admin\/access-denied/);

  const owner = await freshContext(browser, { storageState: statePath("owner") }); const op = await owner.newPage();
  await op.goto("/admin/team");
  await op.getByRole("button", { name: new RegExp(`actions for ${invitee.name}`, "i") }).click();
  await op.getByRole("menuitem", { name: "Auditor (read-only)" }).click();
  await expect(op.getByText(/is now Auditor/i)).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page, "auditors may read the audit log").toHaveURL(/\/admin\/audit/);
  await page.goto("/admin/support/" + randomUUID());
  await expect(page.getByText("We couldn't find that")).toBeVisible(); // auditors read support; they can't manage it
  await owner.close(); await ctx.close();
});

test("suspending someone locks them out immediately; reactivating restores access", async ({ browser }) => {
  const { ctx, page } = await inviteeContext(browser);
  await page.goto("/admin/dashboard");
  const owner = await freshContext(browser, { storageState: statePath("owner") }); const op = await owner.newPage();
  await op.goto("/admin/team");
  await op.getByRole("button", { name: new RegExp(`actions for ${invitee.name}`, "i") }).click();
  await op.getByRole("menuitem", { name: /suspend access/i }).click();
  await op.getByRole("alertdialog").getByRole("button", { name: "Suspend" }).click();
  await expect(op.getByText(/access suspended/i)).toBeVisible();

  await page.goto("/admin/dashboard");
  await expect(page, "the open session stops working at once").toHaveURL(/\/login/);
  expect((await ctx.request.get("/api/admin/search?q=ab")).status()).toBe(401);
  await ctx.close();

  const denied = await freshContext(browser); const pd = await denied.newPage();
  await uiLogin(pd, { key: "invitee", email: invitee.email, role: "auditor", name: invitee.name }, invitee.password);
  await expect(alertOf(pd)).toContainText(/couldn.t sign you in/i);
  await denied.close();

  await op.getByRole("button", { name: new RegExp(`actions for ${invitee.name}`, "i") }).click();
  await op.getByRole("menuitem", { name: /reactivate access/i }).click();
  await op.getByRole("alertdialog").getByRole("button", { name: "Reactivate" }).click();
  await expect(op.getByText(/access restored/i)).toBeVisible();
  await resetRateLimits();
  const back = await inviteeContext(browser); // waits for the dashboard, so reaching here proves access is restored
  await back.ctx.close(); await owner.close();
});

test.describe("an administrator cannot hand out or touch top-level access", () => {
  test.use({ storageState: statePath("admin") });

  test("the invite form offers neither Owner nor Administrator", async ({ page }) => {
    await page.goto("/admin/team");
    await page.getByRole("button", { name: /invite someone/i }).click();
    await page.getByRole("combobox", { name: /role/i }).click();
    const options = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
    expect(options).toEqual(expect.arrayContaining(["Production operator", "Warehouse operator", "Support agent", "Auditor (read-only)"]));
    expect(options).not.toContain("Owner");
    expect(options).not.toContain("Administrator");
  });

  test("owners and other administrators show no management menu", async ({ page }) => {
    await page.goto("/admin/team");
    await expect(page.getByRole("button", { name: /actions for e2e owner/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /actions for dev owner/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /actions for e2e mfa/i })).toHaveCount(0); // another admin
  });
});
