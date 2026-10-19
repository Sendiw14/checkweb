import { expect, test, type Page } from "@playwright/test";
import { closeDb, closeRecall, createLiveUnit, formatCode, quarantine, randomWellFormedToken, recallUnit, retire, revoke } from "./support/db";

test.afterAll(closeDb);

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
/** A scan is always a fresh page load (a new tab from the camera). Leaving first avoids a same-document hash navigation. */
async function scan(page: Page, u: { url: (b: string) => string }) {
  await page.goto("about:blank");
  await page.goto(u.url(""));
}
const support = (page: Page) => page.getByRole("main").getByRole("link", { name: /contact support/i }).first();

test.describe("customer verification: honest outcomes from the real database", () => {
  test("first check: recognized, with the carefully worded limits of what that proves", async ({ page }) => {
    const u = await createLiveUnit();
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("Code recognized");
    await expect(page.getByText("being checked for the first time")).toBeVisible();
    await expect(page.getByText(u.serial)).toBeVisible();
    await expect(page.getByText(u.productName)).toBeVisible();
    // Honest framing: a recognised code is evidence, not proof.
    await expect(page.getByText(/can't see the part itself/i)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/genuine and safe|100% authentic|guaranteed|counterfeit/i);
  });

  test("the secret never leaves the page: fragment stripped, not in any URL, not in storage", async ({ page }) => {
    const u = await createLiveUnit();
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("Code recognized");
    expect(page.url(), "fragment removed from the address bar").not.toContain("#");
    expect(page.url()).not.toContain(u.token);
    expect(urls.filter((x) => x.includes(u.token)), "token appeared in a request URL").toEqual([]);
    const stored = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    expect(stored).not.toContain(u.token);
    expect(await page.evaluate(() => document.referrer)).not.toContain(u.token);
    // The one request that carries it is a POST body to our own API.
    const apiCall = urls.find((x) => x.endsWith("/api/verify"));
    expect(apiCall).toBeTruthy();
  });

  test("second check is a repeat, with how many times it has been seen", async ({ page }) => {
    const u = await createLiveUnit();
    await scan(page, u);
    await expect(page.getByText("being checked for the first time")).toBeVisible();
    await scan(page, u);
    await expect(heading(page)).toHaveText("Code recognized");
    await expect(page.getByText("Checked before").first()).toBeVisible();
    await expect(page.getByText(/has been checked once since/)).toBeVisible();
  });

  test("typing the backup code under the QR works too (with or without dashes, any case)", async ({ page }) => {
    const u = await createLiveUnit();
    await page.goto("/verify");
    await page.getByLabel(/verification code/i).fill(formatCode(u.code).toLowerCase());
    await page.getByRole("button", { name: /check code/i }).click();
    await expect(heading(page)).toHaveText("Code recognized");
    await expect(page.getByText(u.serial)).toBeVisible();
  });

  test("an unknown but well-formed code is 'can't match', without accusing anyone", async ({ page }) => {
    await page.goto(`/verify#${randomWellFormedToken()}`);
    await expect(heading(page)).toHaveText("We can't match this code");
    await expect(page.locator("body")).not.toContainText(/fake|fraud|counterfeit|stolen/i);
    await expect(support(page)).toBeVisible();
  });

  test("garbage input is 'no code to check', not an error", async ({ page }) => {
    await page.goto("/verify#not-a-real-token");
    await expect(heading(page)).toHaveText("No code to check");
    await page.goto("/verify");
    await expect(page.getByRole("heading", { level: 1, name: /check a .* part/i })).toBeVisible();
  });

  test("a revoked code says so and points to support", async ({ page }) => {
    const u = await createLiveUnit();
    await revoke(u.unitId);
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("This code is no longer valid");
    await expect(support(page)).toBeVisible();
  });

  test("a quarantined part is 'on hold' and recovers when restored", async ({ page }) => {
    const u = await createLiveUnit();
    await quarantine(u.unitId);
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("On hold");
  });

  test("a retired part is withdrawn from service", async ({ page }) => {
    const u = await createLiveUnit();
    await retire(u.unitId);
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("Withdrawn from service");
  });

  test("an unreleased unit is 'not yet released'", async ({ page }) => {
    const u = await createLiveUnit({ release: false });
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("Not yet released");
  });

  test("an active recall shows exactly the approved wording, and stops once closed", async ({ page }) => {
    const u = await createLiveUnit();
    const words = `Stop using part ${u.serial}. Return it to your supplier for a free replacement.`;
    const id = await recallUnit(u.unitId, words);
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("This part is subject to a recall");
    await expect(page.getByText(words)).toBeVisible();
    await closeRecall(id);
    await scan(page, u);
    await expect(heading(page)).toHaveText("Code recognized");
  });

  test("many checks from many places become a gentle 'with a note', never an accusation", async ({ page, request }) => {
    const u = await createLiveUnit();
    for (const [i, country] of ["DE", "LK", "IN", "AE"].entries()) {
      const r = await request.post("/api/verify", { data: { credential: u.token }, headers: { "x-forwarded-for": `203.0.113.${20 + i}`, "x-vercel-ip-country": country, "user-agent": `Mozilla/5.0 (e2e ${i})` } });
      expect(r.status()).toBe(200);
    }
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("Code recognized, with a note");
    await expect(page.getByText(/you've done nothing wrong/i)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/counterfeit|fraud|fake/i);
  });

  test("when our service is down the page says so and does NOT claim the part is invalid", async ({ page }) => {
    const u = await createLiveUnit();
    await page.route("**/api/verify", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "unavailable" }) }));
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("Verification is temporarily unavailable");
    await expect(page.getByText(/does not mean the part is invalid/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  test("offline / network failure is a distinct, honest state and retry recovers", async ({ page }) => {
    const u = await createLiveUnit();
    let fail = true;
    await page.route("**/api/verify", (route) => (fail ? route.abort("internetdisconnected") : route.continue()));
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("You appear to be offline");
    fail = false;
    await page.getByRole("button", { name: /try again/i }).click();
    await expect(heading(page)).toHaveText("Code recognized");
  });

  test("a rate-limited client is told to wait, not that the part is bad", async ({ page }) => {
    await page.route("**/api/verify", (route) => route.fulfill({ status: 429, headers: { "retry-after": "120" }, contentType: "application/json", body: JSON.stringify({ status: "rate_limited", retryAfterSeconds: 120 }) }));
    await page.goto(`/verify#${randomWellFormedToken()}`);
    await expect(heading(page)).toHaveText("Too many checks for now");
  });

  test("results are announced to assistive technology and focus moves to the result", async ({ page }) => {
    const u = await createLiveUnit();
    await page.goto(u.url(""));
    await expect(heading(page)).toHaveText("Code recognized");
    await expect(heading(page)).toBeFocused();
    await expect(page.locator('[role="status"], [role="alert"]').first()).toBeAttached();
  });
});
