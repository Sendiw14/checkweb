import { expect, test } from "@playwright/test";
import { infiniteAnimations, settled } from "./support/settled";
import { statePath } from "./support/users";

/**
 * The only specs that run with animations ON (the `motion` project). They guard against regressions that exist
 * only while things move: a transform left behind by a filled animation, or a loop that never ends.
 */
test.describe("public pages never loop forever (WCAG 2.2.2)", () => {
  for (const path of ["/", "/verify", "/faq", "/support", "/login"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await settled(page);
      expect(await infiniteAnimations(page)).toEqual([]);
    });
  }
});

test.describe("staff shell", () => {
  test.use({ storageState: statePath("owner") });

  test("the sidebar stays put when the page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle");
    await settled(page);
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(scrollable, "the dashboard must be tall enough to scroll for this check to mean anything").toBeGreaterThan(150);
    await page.evaluate(() => window.scrollTo(0, 150));
    await page.waitForFunction(() => window.scrollY >= 100);
    const top = await page.locator("aside").first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(top, "a filled page-enter animation turns the shell into the containing block of position:fixed").toBe(0);
  });

  test("no infinite animation runs on the dashboard once loaded", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle");
    await settled(page);
    expect(await infiniteAnimations(page)).toEqual([]);
  });
});
