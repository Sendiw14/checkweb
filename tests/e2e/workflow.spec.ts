import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { labelSpecSchema } from "@/server/labels/spec";
import { decodeSheet, tokenFromUrl } from "../support/pdf-decode";
import { closeDb, db } from "./support/db";
import { freshContext, statePath } from "./support/users";

/**
 * The whole point of the product, end to end, through the real UI and the real database:
 *
 *   owner creates a product  ->  production operator registers a batch and generates labels, downloads the PDF,
 *   confirms printed/applied and passes QC  ->  warehouse operator releases  ->  a customer scans the QR that is
 *   physically in the PDF and is told the truth.
 *
 * Roles are split on purpose: the people who print labels cannot release stock.
 */
test.describe.configure({ mode: "serial" });
test.afterAll(closeDb);

const hasPoppler = (() => { try { execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();
const tag = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const SKU = `E2E-WF-${tag}`;
const PART = `E2E-PN-${tag}`;
const NAME = `Workflow Brake Pad ${tag}`;
const BATCH = `E2E-WF-B-${tag}`;
const QTY = 3;

const state = { productId: "", batchId: "", jobId: "", pdf: Buffer.alloc(0), urls: [] as string[], serials: [] as string[] };

test("owner creates a product", async ({ browser }) => {
  const ctx = await freshContext(browser, { storageState: statePath("owner") }); const page = await ctx.newPage();
  await page.goto("/admin/products/new");
  await page.getByLabel(/^SKU/).fill(SKU);
  await page.getByLabel(/^Part number/).fill(PART);
  await page.getByLabel(/^Product name/).fill(NAME);
  await page.getByLabel(/^Brand/).fill("Axiom");
  await page.getByLabel(/^Category/).fill("Brakes");
  await page.getByRole("button", { name: /create product/i }).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}/);
  state.productId = page.url().split("/").pop()!.split("?")[0]!;
  await expect(page.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
  await ctx.close();
});

test("a duplicate SKU is refused with a field-level message, not a crash", async ({ browser }) => {
  const ctx = await freshContext(browser, { storageState: statePath("owner") }); const page = await ctx.newPage();
  await page.goto("/admin/products/new");
  await page.getByLabel(/^SKU/).fill(SKU);
  await page.getByLabel(/^Part number/).fill(`${PART}-2`);
  await page.getByLabel(/^Product name/).fill(`${NAME} copy`);
  await page.getByRole("button", { name: /create product/i }).click();
  await expect(page.getByText(/already uses this sku|already exists|already in use/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/products\/new/);
  await ctx.close();
});

test("production operator registers a batch with its units", async ({ browser }) => {
  const ctx = await freshContext(browser, { storageState: statePath("production_operator") }); const page = await ctx.newPage();
  await page.goto("/admin/batches/new");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: new RegExp(SKU) }).click();
  await page.getByLabel(/^Batch code/).fill(BATCH);
  await page.getByLabel(/^Expected quantity/).fill(String(QTY));
  await page.getByRole("button", { name: /create batch and register units/i }).click();
  await expect(page).toHaveURL(/\/admin\/batches\/[0-9a-f-]{36}/);
  state.batchId = page.url().split("/").pop()!.split("?")[0]!;
  await expect(page.getByRole("heading", { level: 1 })).toContainText(BATCH);
  const rows = await db().query("select serial_number from public.part_units where batch_id = $1 order by serial_number", [state.batchId]);
  expect(rows.rowCount).toBe(QTY);
  state.serials = rows.rows.map((r) => r.serial_number);
  // Serials are sequential identifiers; the secret is separate and doesn't exist yet.
  expect((await db().query("select count(*)::int n from public.part_tokens t join public.part_units u on u.id = t.unit_id where u.batch_id = $1", [state.batchId])).rows[0].n).toBe(0);
  await ctx.close();
});

test("before any label exists, nothing can be verified", async ({ page }) => {
  // The serial alone is not a credential: a made-up code for this batch's units resolves to nothing.
  await page.goto(`/verify#${"A".repeat(43)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We can't match this code");
});

test("production operator generates labels through the wizard and the job runs to completion", async ({ browser }) => {
  const ctx = await freshContext(browser, { storageState: statePath("production_operator") }); const page = await ctx.newPage();
  await page.goto("/admin/labels/new");
  await page.getByRole("radio", { name: new RegExp(BATCH) }).click();
  await page.getByRole("button", { name: /^continue/i }).click();
  await expect(page.getByRole("heading", { name: "Quantity and layout" })).toBeVisible();
  await expect(page.getByLabel(/^Number of labels/)).toHaveValue(String(QTY));
  await page.getByRole("button", { name: /^continue/i }).click();
  await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
  await expect(page.getByText(/PDFs contain live codes/i)).toBeVisible();
  const generate = page.getByRole("button", { name: new RegExp(`generate ${QTY} labels`, "i") });
  await expect(generate, "cannot proceed without acknowledging").toBeDisabled();
  await page.getByRole("checkbox").check();
  await generate.click();
  await expect(page).toHaveURL(/\/admin\/label-jobs\/[0-9a-f-]{36}/);
  state.jobId = page.url().split("/label-jobs/")[1]!.split("?")[0]!;
  await expect(page.getByText("All labels generated")).toBeVisible({ timeout: 45_000 });
  await ctx.close();
});

test("tokens exist only as hashes; no plaintext secret is stored anywhere", async () => {
  const { rows } = await db().query("select count(*)::int n from public.part_tokens t join public.part_units u on u.id = t.unit_id where u.batch_id = $1 and t.status = 'active'", [state.batchId]);
  expect(rows[0].n).toBe(QTY);
  const cols = (await db().query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'part_tokens'")).rows.map((r) => r.column_name);
  expect(cols).toEqual(expect.arrayContaining(["token_hash"]));
  expect(cols.filter((c) => /^token$|plain|secret|raw/.test(c))).toEqual([]);
});

test("downloading the PDF is permitted for the operator, audited, and refused to support staff", async ({ browser }) => {
  const prod = await freshContext(browser, { storageState: statePath("production_operator") });
  const res = await prod.request.get(`/api/admin/label-jobs/${state.jobId}/download/1`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["cache-control"]).toContain("no-store");
  state.pdf = Buffer.from(await res.body());
  expect(state.pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await prod.close();

  const support = await freshContext(browser, { storageState: statePath("support_agent") });
  expect((await support.request.get(`/api/admin/label-jobs/${state.jobId}/download/1`)).status()).toBe(403);
  await support.close();

  const audit = await db().query("select actor_email, actor_role, metadata from public.audit_logs where action = 'label.download' and target_id = $1", [state.jobId]);
  expect(audit.rowCount).toBe(1);
  expect(audit.rows[0].actor_email).toBe("e2e-production@example.test");
  expect(audit.rows[0].actor_role).toBe("production_operator");
  // Metadata is exactly the file's fingerprint: never the codes inside it.
  expect(Object.keys(audit.rows[0].metadata).sort()).toEqual(["bytes", "part", "sha256"]);
  expect(audit.rows[0].metadata.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(audit.rows[0].metadata)).not.toContain("verify#");
});

test("the QR codes printed in that PDF decode to verification URLs", async () => {
  test.skip(!hasPoppler, "needs poppler-utils (pdftoppm) to rasterise the PDF");
  const specJson = (await db().query("select label_spec from public.label_jobs where id = $1", [state.jobId])).rows[0].label_spec;
  const decoded = decodeSheet(new Uint8Array(state.pdf), labelSpecSchema.parse(specJson), { count: QTY });
  expect(decoded.every((d) => d !== null), `decoded: ${JSON.stringify(decoded)}`).toBe(true);
  for (const url of decoded as string[]) {
    expect(url).toMatch(/^https?:\/\/[^/]+\/verify#[A-Za-z0-9_-]{43}$/);
    expect(tokenFromUrl(url)).toHaveLength(43);
  }
  expect(new Set(decoded).size, "every label carries a different secret").toBe(QTY);
  state.urls = decoded as string[];
});

test("scanning a printed-but-unconfirmed label says 'not yet released', not 'genuine'", async ({ page }) => {
  test.skip(!hasPoppler, "needs the decoded QR codes");
  await page.goto(`/verify#${tokenFromUrl(state.urls[0]!)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not yet released");
});

test("production operator confirms the files were printed and applied, then passes QC", async ({ browser }) => {
  const ctx = await freshContext(browser, { storageState: statePath("production_operator") }); const page = await ctx.newPage();
  await page.goto(`/admin/label-jobs/${state.jobId}`);
  await page.getByRole("button", { name: /confirm printed/i }).click();
  await page.getByRole("button", { name: "Yes, printed" }).click();
  await expect(page.getByText(new RegExp(`${QTY} (units )?(marked )?printed|printed`, "i")).first()).toBeVisible();
  await page.getByRole("button", { name: /confirm applied/i }).click();
  await page.getByRole("button", { name: "Yes, applied" }).click();
  await expect.poll(async () => (await db().query("select count(*)::int n from public.part_units where batch_id = $1 and label_status = 'applied'", [state.batchId])).rows[0].n, { timeout: 15_000 }).toBe(QTY);

  await page.goto(`/admin/batches/${state.batchId}`);
  await page.getByRole("button", { name: /^pass qc/i }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Pass QC" }).click();
  await expect.poll(async () => (await db().query("select count(*)::int n from public.part_units where batch_id = $1 and lifecycle_status = 'qc_passed'", [state.batchId])).rows[0].n, { timeout: 15_000 }).toBe(QTY);

  // Separation of duties: the person who printed the labels has no Release button.
  await expect(page.getByRole("button", { name: /^release/i })).toHaveCount(0);
  await ctx.close();
});

test("warehouse operator releases the units", async ({ browser }) => {
  const ctx = await freshContext(browser, { storageState: statePath("warehouse_operator") }); const page = await ctx.newPage();
  await page.goto(`/admin/batches/${state.batchId}`);
  await page.getByRole("button", { name: new RegExp(`^release ${QTY} units`, "i") }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: new RegExp(`release ${QTY} units`, "i") }).click();
  await expect.poll(async () => (await db().query("select count(*)::int n from public.part_units where batch_id = $1 and lifecycle_status = 'released'", [state.batchId])).rows[0].n, { timeout: 15_000 }).toBe(QTY);
  await ctx.close();
});

test("a customer scanning the physically printed QR is told the code is recognized, for the right product", async ({ browser }) => {
  test.skip(!hasPoppler, "needs the decoded QR codes");
  const seen: string[] = [];
  for (const url of state.urls) {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL }); const page = await ctx.newPage();
    await page.goto(`/verify#${tokenFromUrl(url)}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Code recognized");
    await expect(page.getByText("being checked for the first time")).toBeVisible();
    await expect(page.getByText(NAME)).toBeVisible();
    seen.push((await page.locator("[class*=serial], .text-serial").first().innerText().catch(() => "")).trim());
    await ctx.close();
  }
  // Exactly the batch's serials were reachable, one scan each.
  const events = await db().query(
    "select u.serial_number from public.verification_events e join public.part_units u on u.id = e.unit_id where u.batch_id = $1 and e.result = 'recognized_first' and e.channel = 'customer' order by 1", [state.batchId]);
  expect(events.rows.map((r) => r.serial_number)).toEqual(state.serials);
});

test("the audit trail names who did each step, in order, with no secrets", async () => {
  const rows = (await db().query(
    `select action, actor_email, actor_role from public.audit_logs
     where target_id in ($1, $2, $3) or (metadata->>'batchId') = $2 order by id`, [state.productId, state.batchId, state.jobId])).rows;
  const actions = rows.map((r) => r.action);
  for (const a of ["product.create", "batch.create", "label.download", "batch.qc_pass", "batch.release"]) expect(actions, a).toContain(a);
  expect(rows.find((r) => r.action === "batch.release")).toMatchObject({ actor_email: "e2e-warehouse@example.test", actor_role: "warehouse_operator" });
  expect(rows.find((r) => r.action === "batch.qc_pass")).toMatchObject({ actor_role: "production_operator" });
  expect(rows.find((r) => r.action === "product.create")).toMatchObject({ actor_role: "owner" });
  const all = (await db().query("select metadata::text m from public.audit_logs where created_at > now() - interval '1 hour'")).rows.map((r) => r.m).join("\n");
  for (const url of state.urls) expect(all).not.toContain(tokenFromUrl(url));
});
