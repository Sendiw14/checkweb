/**
 * Regenerates docs/screenshots/*.png from a running local app (pnpm dev) and local stack.
 * Uses the e2e fixtures: it creates fresh sample units, so every customer outcome is REAL output of the
 * verification function, not a mock. Staff pages are shot as the e2e owner with a saved session.
 *
 *   pnpm dev:stack && pnpm dev           # in other terminals
 *   pnpm exec playwright test --list >/dev/null   # (once) creates the e2e users and sessions via global setup
 *   pnpm docs:screenshots
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";
import { closeDb, closeRecall, createLiveUnit, db, quarantine, randomWellFormedToken, recallUnit, revoke } from "../tests/e2e/support/db";
import { E2E } from "../tests/e2e/support/env";
import { statePath } from "../tests/e2e/support/users";

const out = "docs/screenshots";
mkdirSync(out, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const phone = { ...devices["Pixel 7"], reducedMotion: "reduce" as const, baseURL: E2E.baseURL };
  const desk = { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" as const, baseURL: E2E.baseURL };

  // ---- customer outcomes (phone) ---------------------------------------------------------------
  const ok = await createLiveUnit();
  const revoked = await createLiveUnit(); await revoke(revoked.unitId);
  const hold = await createLiveUnit(); await quarantine(hold.unitId);
  const recalled = await createLiveUnit();
  const recallId = await recallUnit(recalled.unitId, "Stop using this part and return it to your supplier for a free replacement. Do not fit it to a vehicle.");
  const states: [string, string][] = [
    ["verify-recognized", ok.url("")], ["verify-revoked", revoked.url("")], ["verify-on-hold", hold.url("")],
    ["verify-recalled", recalled.url("")], ["verify-not-found", `/verify#${randomWellFormedToken()}`],
  ];
  const pctx = await browser.newContext(phone);
  for (const [name, path] of states) {
    const page = await pctx.newPage();
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(900); // let the draw-in animation settle
    await page.screenshot({ path: `${out}/${name}-390.png` });
    await page.close();
  }
  // service unavailable is a state of the page, so simulate the network answer exactly as production would send it
  {
    const page = await pctx.newPage();
    await page.route("**/api/verify", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "unavailable" }) }));
    await page.goto(ok.url(""));
    await page.getByRole("heading", { level: 1, name: /temporarily unavailable/i }).waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/verify-unavailable-390.png` });
    await page.close();
  }
  await pctx.close();
  await closeRecall(recallId);

  // ---- public site (desktop) ---------------------------------------------------------------------
  const dctx = await browser.newContext(desk);
  for (const [name, path] of [["home", "/"], ["verify-idle", "/verify"], ["faq", "/faq"]] as const) {
    const page = await dctx.newPage();
    await page.goto(path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}-1440.png` });
    await page.close();
  }
  await dctx.close();

  // ---- staff workspace (desktop, owner) -----------------------------------------------------------
  const sctx = await browser.newContext({ ...desk, storageState: statePath("owner") });
  const one = async (sql: string) => (await db().query(sql)).rows[0]?.id as string | undefined;
  const batch = await one("select id from public.manufacturing_batches where batch_code like 'DEV-%' order by created_at limit 1") ?? await one("select id from public.manufacturing_batches limit 1");
  const unit = await one("select id from public.part_units where scan_count > 3 order by scan_count desc limit 1");
  const staff: [string, string | undefined][] = [
    ["admin-dashboard", "/admin/dashboard"], ["admin-products", "/admin/products"], ["admin-batch", batch && `/admin/batches/${batch}`],
    ["admin-unit", unit && `/admin/part-units/${unit}`], ["admin-label-wizard", "/admin/labels/new"], ["admin-scans", "/admin/scans?page=1"],
    ["admin-investigations", "/admin/investigations"], ["admin-recalls", "/admin/recalls"], ["admin-reports", "/admin/reports"],
    ["admin-team", "/admin/team"], ["admin-audit", "/admin/audit"], ["admin-security", "/admin/security"],
  ];
  for (const [name, path] of staff) {
    if (!path) continue;
    const page = await sctx.newPage();
    await page.goto(path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${name}-1440.png`, fullPage: false });
    await page.close();
  }
  await sctx.close();

  // ---- staff on a phone ---------------------------------------------------------------------------
  const mctx = await browser.newContext({ ...phone, storageState: statePath("owner") });
  for (const [name, path] of [["admin-dashboard", "/admin/dashboard"], ["admin-scans", "/admin/scans?page=1"]] as const) {
    const page = await mctx.newPage();
    await page.goto(path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${name}-390.png` });
    await page.close();
  }
  await mctx.close();
  await browser.close();
  await closeDb();
  process.stdout.write(`screenshots written to ${out}/\n`);
}

main().catch((e) => { process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`); process.exitCode = 1; });
