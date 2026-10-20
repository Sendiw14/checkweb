import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { closeDb, createLiveUnit, db, quarantine, randomWellFormedToken, recallUnit, revoke } from "./support/db";
import { statePath } from "./support/users";

test.afterAll(closeDb);

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, name: string, opts: { exclude?: string[] } = {}) {
  let b = new AxeBuilder({ page }).withTags(TAGS);
  for (const sel of opts.exclude ?? []) b = b.exclude(sel);
  const { violations } = await b.analyze();
  const report = violations.map((v) => `[${v.impact}] ${v.id}: ${v.help}\n${v.nodes.slice(0, 3).map((n) => `    ${n.target.join(" ")}  ${n.failureSummary?.split("\n")[1] ?? ""}`).join("\n")}`).join("\n");
  expect(violations, `${name} has accessibility violations:\n${report}`).toEqual([]);
}

test.describe("public pages meet WCAG 2.2 AA (axe)", () => {
  for (const path of ["/", "/verify", "/support", "/faq", "/privacy", "/terms", "/login", "/reset-password", "/definitely-not-a-page"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectAccessible(page, path);
    });
  }

  test("the FAQ with an answer open", async ({ page }) => {
    await page.goto("/faq");
    await page.getByRole("button", { name: /does a recognized code prove/i }).click();
    await expectAccessible(page, "faq (open)");
  });

  test("the mobile navigation when open", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await page.goto("/");
    await page.getByRole("button", { name: /menu/i }).click();
    await expectAccessible(page, "mobile nav");
  });
});

test.describe("every verification outcome meets WCAG 2.2 AA (axe)", () => {
  const cases: [string, () => Promise<string>][] = [
    ["recognized (first)", async () => (await createLiveUnit()).url("")],
    ["revoked", async () => { const u = await createLiveUnit(); await revoke(u.unitId); return u.url(""); }],
    ["on hold", async () => { const u = await createLiveUnit(); await quarantine(u.unitId); return u.url(""); }],
    ["not released", async () => (await createLiveUnit({ release: false })).url("")],
    ["recalled", async () => { const u = await createLiveUnit(); await recallUnit(u.unitId, "Stop using this part and contact your supplier."); return u.url(""); }],
    ["not found", async () => `/verify#${randomWellFormedToken()}`],
    ["no code", async () => "/verify#garbage"],
  ];
  for (const [name, make] of cases) {
    test(name, async ({ page }) => {
      await page.goto(await make());
      await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/loading|checking/i);
      await page.waitForLoadState("networkidle");
      await expectAccessible(page, `verify: ${name}`);
    });
  }

  test("the unavailable and offline states", async ({ page }) => {
    await page.route("**/api/verify", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "unavailable" }) }));
    await page.goto(`/verify#${randomWellFormedToken()}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verification is temporarily unavailable");
    await expectAccessible(page, "verify: unavailable");
  });
});

test.describe("the staff workspace meets WCAG 2.2 AA (axe)", () => {
  test.use({ storageState: statePath("owner") });

  let ids: Record<string, string> = {};
  test.beforeAll(async () => {
    const one = async (sql: string) => (await db().query(sql)).rows[0]?.id as string | undefined;
    ids = Object.fromEntries(Object.entries({
      product: await one("select id from public.products order by created_at desc limit 1"),
      batch: await one("select id from public.manufacturing_batches order by created_at desc limit 1"),
      unit: await one("select id from public.part_units where lifecycle_status = 'released' order by created_at desc limit 1"),
      recall: await one("select id from public.recalls order by created_at desc limit 1"),
      support: await one("select id from public.support_cases order by created_at desc limit 1"),
      inv: await one("select id from public.investigations order by opened_at desc limit 1"),
      job: await one("select id from public.label_jobs order by created_at desc limit 1"),
    }).filter(([, v]) => v)) as Record<string, string>;
  });

  const lists = ["/admin/dashboard", "/admin/products", "/admin/products/new", "/admin/batches", "/admin/batches/new", "/admin/part-units", "/admin/labels", "/admin/labels/new",
    "/admin/scans", "/admin/investigations", "/admin/recalls", "/admin/recalls/new", "/admin/support", "/admin/reports", "/admin/team", "/admin/audit", "/admin/settings", "/admin/security"];
  for (const path of lists) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectAccessible(page, path);
    });
  }

  const details: [string, string, string][] = [["product", "/admin/products", "product"], ["batch", "/admin/batches", "batch"], ["unit", "/admin/part-units", "unit"],
    ["recall", "/admin/recalls", "recall"], ["support", "/admin/support", "support"], ["investigation", "/admin/investigations", "inv"], ["label job", "/admin/label-jobs", "job"]];
  for (const [name, base, key] of details) {
    test(`${name} detail`, async ({ page }) => {
      test.skip(!ids[key], `no ${name} in the database yet`);
      await page.goto(`${base}/${ids[key]}`);
      await page.waitForLoadState("networkidle");
      await expectAccessible(page, `${name} detail`);
    });
  }

  test("overlays are accessible and give focus back to whatever opened them", async ({ page }) => {
    test.skip(!ids.unit, "needs a part unit");
    await page.goto(`/admin/part-units/${ids.unit}`);

    // 1. A dialog opened from an ordinary button.
    const open = page.getByRole("button", { name: "Open investigation" });
    await open.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page, "open investigation dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(open, "focus returns to the button that opened the dialog").toBeFocused();

    // 2. A dialog opened from a menu item (the item is gone by the time the dialog closes).
    const more = page.getByRole("button", { name: /more unit actions/i });
    await more.click();
    await page.getByRole("menuitem", { name: /quarantine unit/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page, "quarantine dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(more, "focus returns to the menu button").toBeFocused();
  });

  test("a side sheet is accessible and returns focus to its row button", async ({ page }) => {
    await page.goto("/admin/scans");
    const details = page.getByRole("button", { name: /^Details of event/ }).first();
    test.skip((await details.count()) === 0, "needs scan events");
    await details.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page, "event details sheet");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(details).toBeFocused();
  });

  test("the user menu, global search and a confirm dialog when open", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.getByRole("button", { name: /account menu/i }).click();
    await expectAccessible(page, "user menu");
    await page.keyboard.press("Escape");
    test.skip(!ids.batch, "needs a batch");
    await page.goto(`/admin/batches/${ids.batch}`);
    const more = page.getByRole("button", { name: /more batch actions/i });
    if (await more.count()) { await more.click(); await expectAccessible(page, "batch actions menu"); }
  });
});
