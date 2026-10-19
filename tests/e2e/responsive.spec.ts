import { expect, test, type Page } from "@playwright/test";
import { closeDb, db } from "./support/db";
import { statePath } from "./support/users";

test.afterAll(closeDb);

// 320 is WCAG 1.4.10 "Reflow" (what 400% zoom on a 1280px screen gives you).
const VIEWPORTS = [[320, 568], [360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]] as const;

async function check(page: Page, path: string, w: number, h: number, errors: string[]) {
  await page.setViewportSize({ width: w, height: h });
  errors.length = 0;
  const res = await page.goto(path);
  expect(res?.status(), `${path} @${w}`).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} scrolls sideways by ${overflow}px at ${w}px wide`).toBeLessThanOrEqual(0);
  // Sticky header and footers must never hide the main landmark's first heading.
  const h1 = page.getByRole("heading", { level: 1 }).first();
  await expect(h1, `${path} @${w}`).toBeVisible();
  expect(errors, `${path} @${w} logged errors`).toEqual([]);
}

function watch(page: Page, errors: string[]) {
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    // Browsers log every 4xx fetch as a console error; failed requests are judged by the response check below.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on("response", (r) => {
    // /api/verify answers 404 for a code it doesn't know. That is the contract, not a fault.
    if (r.status() >= 400 && !(r.url().endsWith("/api/verify") && r.status() === 404)) errors.push(`http ${r.status()}: ${r.url().slice(0, 120)}`);
  });
}

test.describe("public routes reflow without sideways scrolling or errors", () => {
  test("home, verify, support, faq, privacy, terms, login, 404", async ({ page }) => {
    const errors: string[] = []; watch(page, errors);
    for (const path of ["/", "/verify", "/support", "/faq", "/privacy", "/terms", "/login", "/reset-password"]) {
      for (const [w, h] of VIEWPORTS) await check(page, path, w, h, errors);
    }
  });

  test("every verification outcome", async ({ page }) => {
    const { createLiveUnit, quarantine, recallUnit, revoke, randomWellFormedToken } = await import("./support/db");
    const errors: string[] = []; watch(page, errors);
    const ok = await createLiveUnit();
    const rv = await createLiveUnit(); await revoke(rv.unitId);
    const hold = await createLiveUnit(); await quarantine(hold.unitId);
    const rc = await createLiveUnit(); await recallUnit(rc.unitId, "Stop using this part and return it to your supplier for a free replacement. ".repeat(3));
    for (const url of [ok.url(""), rv.url(""), hold.url(""), rc.url(""), `/verify#${randomWellFormedToken()}`]) {
      for (const [w, h] of VIEWPORTS) {
        await page.goto("about:blank");
        await check(page, url, w, h, errors);
      }
    }
  });
});

test.describe("staff routes reflow without sideways scrolling or errors", () => {
  test.use({ storageState: statePath("owner") });
  test.setTimeout(120_000);

  const LISTS = ["/admin/dashboard", "/admin/products", "/admin/products/new", "/admin/batches", "/admin/batches/new", "/admin/part-units", "/admin/labels", "/admin/labels/new",
    "/admin/scans", "/admin/investigations", "/admin/recalls", "/admin/recalls/new", "/admin/support", "/admin/reports", "/admin/team", "/admin/audit", "/admin/settings", "/admin/security"];
  for (const path of LISTS) {
    test(path, async ({ page }) => {
      const errors: string[] = []; watch(page, errors);
      for (const [w, h] of VIEWPORTS) await check(page, path, w, h, errors);
    });
  }

  const DETAILS: [string, string, string][] = [
    ["product", "/admin/products", "select id from public.products order by created_at desc limit 1"],
    ["batch", "/admin/batches", "select id from public.manufacturing_batches order by created_at desc limit 1"],
    ["part unit", "/admin/part-units", "select id from public.part_units where lifecycle_status = 'released' order by created_at desc limit 1"],
    ["recall", "/admin/recalls", "select id from public.recalls order by created_at desc limit 1"],
    ["support case", "/admin/support", "select id from public.support_cases order by created_at desc limit 1"],
    ["investigation", "/admin/investigations", "select id from public.investigations order by opened_at desc limit 1"],
    ["label job", "/admin/label-jobs", "select id from public.label_jobs order by created_at desc limit 1"],
  ];
  for (const [name, base, sql] of DETAILS) {
    test(`${name} detail`, async ({ page }) => {
      const id = (await db().query(sql)).rows[0]?.id as string | undefined;
      test.skip(!id, `no ${name} in the database yet`);
      const errors: string[] = []; watch(page, errors);
      for (const [w, h] of VIEWPORTS) await check(page, `${base}/${id}`, w, h, errors);
    });
  }
});
