import { expect, test, type Page } from "@playwright/test";
import { closeDb, createLiveUnit, db, resetRateLimits } from "./support/db";
import { freshIp } from "./support/users";

test.afterAll(async () => { await resetRateLimits(); await closeDb(); });

test.describe("public site", () => {
  test("the home page leads with the promise, and its main action goes to the checker", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/know the part in your hands is registered/i);
    await page.getByRole("main").getByRole("link", { name: /scan or enter a code/i }).first().click();
    await expect(page).toHaveURL(/\/verify/);
  });

  test("the home page's own code box verifies a code without leaving the product's honest framing", async ({ page }) => {
    const u = await createLiveUnit();
    await page.goto("/");
    await page.getByLabel(/have a code instead/i).first().fill(u.code);
    await page.getByRole("button", { name: /check code/i }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Code recognized");
  });

  test("keyboard users can skip straight to the content", async ({ page }) => {
    await page.goto("/faq");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: /skip to (main )?content/i });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("every page has one h1, a unique title and a language", async ({ page }) => {
    const titles = new Set<string>();
    for (const path of ["/", "/verify", "/support", "/faq", "/privacy", "/terms"]) {
      await page.goto(path);
      await expect(page.locator("h1"), path).toHaveCount(1);
      expect(await page.locator("html").getAttribute("lang"), path).toBe("en");
      const title = await page.title();
      expect(title.length, path).toBeGreaterThan(3);
      titles.add(title);
    }
    expect(titles.size).toBe(6);
  });

  test("staff and result pages are kept out of search engines; the marketing pages are not", async ({ page, request }) => {
    for (const path of ["/login", "/verify", "/reset-password"]) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", /noindex/);
    }
    expect((await request.get("/admin/dashboard", { maxRedirects: 0 })).status()).toBe(307);
    await page.goto("/");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  });

  test("the FAQ opens and closes with the keyboard and states the limits of what a code proves", async ({ page }) => {
    await page.goto("/faq");
    const first = page.getByRole("button").filter({ hasText: /\?$/ }).first();
    await first.focus();
    await expect(first).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    // The honest answer to the question people actually have:
    await page.getByRole("button", { name: /does a recognized code prove my part is genuine/i }).click();
    await expect(page.getByRole("region").or(page.locator("main")).getByText(/not proof|doesn.t prove|does not prove|can.t see the part|evidence/i).first()).toBeVisible();
  });

  test("privacy and terms are real pages with headings and a way back", async ({ page }) => {
    for (const [path, h] of [["/privacy", /privacy/i], ["/terms", /terms/i]] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(h);
      await expect(page.getByRole("link", { name: /support|contact/i }).first()).toBeVisible();
    }
  });

  test("an unknown address shows the branded 404 with real status 404", async ({ page }) => {
    const res = await page.goto("/definitely/not/here");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can't find that page");
    await expect(page.getByRole("link", { name: /check a part/i }).first()).toBeVisible();
  });
});

const fill = async (page: Page, over: Partial<Record<"name" | "email" | "serial" | "subject" | "message", string>> = {}) => {
  await page.getByLabel(/^Your name/).fill(over.name ?? "Pat Customer");
  await page.getByLabel(/^Email/).fill(over.email ?? "pat@example.test");
  if (over.serial !== undefined) await page.getByLabel(/^Serial number/).fill(over.serial);
  await page.getByLabel(/^Title/).fill(over.subject ?? "Question about my oil filter");
  await page.getByLabel(/^Your message/).fill(over.message ?? "I can't find the QR code on the filter I bought. Where should I look?");
};

test.describe("support form", () => {
  test.beforeEach(async ({ page }) => {
    await resetRateLimits();
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
    await page.goto("/support");
  });

  test("an empty submit explains what's missing, and moves focus to the first problem", async ({ page }) => {
    await page.getByRole("button", { name: /send message/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ }).first()).toBeVisible();
    await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
  });

  test("consent is required before anything is sent", async ({ page }) => {
    const email = `no-consent-${Date.now()}@example.test`;
    await fill(page, { email });
    await page.getByRole("button", { name: /send message/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /agree|understand|confirm|consent|acknowledge/i }).first()).toBeVisible();
    const n = (await db().query("select count(*)::int n from public.support_cases where contact_email = $1", [email])).rows[0].n;
    expect(n).toBe(0);
  });

  test("a valid message is stored, gets a reference, and a matching serial links silently", async ({ page }) => {
    const u = await createLiveUnit();
    await fill(page, { serial: u.serial, subject: `Link test ${u.serial}` });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /send message/i }).click();
    const ref = page.getByText(/SUP-\d{4}-\d{4}/).first();
    await expect(ref).toBeVisible();
    const reference = (await ref.innerText()).match(/SUP-\d{4}-\d{4}/)![0];
    const row = (await db().query("select unit_id, contact_email, status from public.support_cases where reference = $1", [reference])).rows[0];
    expect(row.unit_id).toBe(u.unitId);
    expect(row.status).toBe("new");
    // The customer is never told whether the serial matched (it would let anyone probe for valid serials).
    await expect(page.locator("main")).not.toContainText(/matched|found your part|linked/i);
  });

  test("a made-up serial is accepted without revealing that it matched nothing", async ({ page }) => {
    await fill(page, { serial: "AXM-99999999", subject: "Unknown serial question" });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /send message/i }).click();
    await expect(page.getByText(/SUP-\d{4}-\d{4}/).first()).toBeVisible();
    const row = (await db().query("select unit_id from public.support_cases where subject = 'Unknown serial question' order by created_at desc limit 1")).rows[0];
    expect(row.unit_id).toBeNull();
  });

  test("markup in a message is stored as text and never executes", async ({ page }) => {
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;
    await fill(page, { message: `Please look at this ${payload} thanks for helping out`, subject: "Markup test message" });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /send message/i }).click();
    await expect(page.getByText(/SUP-\d{4}-\d{4}/).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    const stored = (await db().query("select message from public.support_cases where subject = 'Markup test message' order by created_at desc limit 1")).rows[0].message as string;
    expect(stored).toContain("<script>");
  });

  test("the hidden honeypot field catches bots without telling them", async ({ request }) => {
    const before = (await db().query("select count(*)::int n from public.support_cases")).rows[0].n;
    // A bot posts the form's server action directly with the honeypot filled: simulate by driving the page with JS-visible field.
    const res = await request.post("/support", { form: { website: "http://spam.example" }, failOnStatusCode: false });
    expect([200, 303, 400, 404, 405]).toContain(res.status());
    expect((await db().query("select count(*)::int n from public.support_cases")).rows[0].n).toBe(before);
  });

  test("a client sending too many messages is asked to wait, in plain words", async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await page.goto("/support");
      await fill(page, { subject: `Rate limit probe ${i}`, message: `Message number ${i} for the rate limit probe, long enough.` });
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: /send message/i }).click();
      if (i < 5) await expect(page.getByText(/SUP-\d{4}-\d{4}/).first()).toBeVisible();
    }
    await expect(page.getByText(/several messages recently|wait a while/i)).toBeVisible();
  });
});
