import { spawnSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateManualCode, generateToken, buildVerificationUrl } from "@/server/security/tokens";
import { renderLabelPdf, type LabelItem } from "@/server/labels/pdf";
import { checkSpec, labelSpecSchema, sheetLayout } from "@/server/labels/spec";
import { qrMatrix } from "@/server/qr";
import { decodeSheet } from "../support/pdf-decode";

const spec = labelSpecSchema.parse({});
const SITE = "https://verify.example.com";

describe("label sheet geometry", () => {
  it("A4 with 50x30 mm labels, 10 mm margins and 3 mm gaps gives 3 x 8 = 24 per page", () => {
    expect(sheetLayout(spec)).toMatchObject({ cols: 3, rows: 8, perPage: 24 });
  });
  it("US Letter and other sizes are computed, never assumed", () => {
    expect(sheetLayout({ ...spec, page: "LETTER" }).perPage).toBeGreaterThan(0);
    expect(sheetLayout({ ...spec, labelWidthMm: 100, labelHeightMm: 60 })).toMatchObject({ cols: 1, rows: 4 });
    expect(sheetLayout({ ...spec, labelWidthMm: 210, labelHeightMm: 297 }).perPage).toBe(0);
  });
});

describe("label spec validation (physical sense)", () => {
  const modules = qrMatrix(buildVerificationUrl(SITE, generateToken()), "Q").size;
  it("accepts the default layout", () => {
    const c = checkSpec(spec, modules);
    expect(c.ok).toBe(true);
    expect(c.moduleMm).toBeGreaterThan(0.4);
  });
  it("rejects a QR code whose modules would print too small", () => {
    const c = checkSpec({ ...spec, qrSizeMm: 12 }, modules);
    expect(c.ok).toBe(false);
    expect(c.errors.join(" ")).toMatch(/cannot reproduce it reliably/);
  });
  it("rejects a QR + quiet zone that does not fit the label height or width", () => {
    expect(checkSpec({ ...spec, labelHeightMm: 22 }, modules).errors.join(" ")).toMatch(/quiet zone/);
    expect(checkSpec({ ...spec, labelWidthMm: 40 }, modules).errors.join(" ")).toMatch(/too narrow/);
  });
  it("warns about small-but-allowed modules and weak error correction", () => {
    const w = checkSpec({ ...spec, qrSizeMm: 16.5, qrErrorCorrection: "M" }, modules);
    expect(w.ok).toBe(true);
    expect(w.warnings.length).toBeGreaterThanOrEqual(1);
  });
  it("coerces and bounds form input", () => {
    expect(labelSpecSchema.safeParse({ labelWidthMm: "50" }).success).toBe(true);
    expect(labelSpecSchema.safeParse({ labelWidthMm: 1 }).success).toBe(false);
    expect(labelSpecSchema.safeParse({ page: "A0" }).success).toBe(false);
  });
});

function makeItems(n: number): LabelItem[] {
  return Array.from({ length: n }, (_, i) => ({
    serial: `AXM-${String(i + 1).padStart(8, "0")}`, token: generateToken(), code: generateManualCode(),
    productName: "Ceramic Brake Pad Set, Front", partNumber: "BP-2041",
  }));
}

describe("renderLabelPdf", () => {
  it("lays 30 labels over 2 pages and stays small and valid", async () => {
    const bytes = await renderLabelPdf({ spec, items: makeItems(30), siteUrl: SITE, company: "Axiom Motive", title: "test" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const [pw, ph] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    expect(pw).toBeCloseTo((210 / 25.4) * 72, 1); // exactly A4
    expect(ph).toBeCloseTo((297 / 25.4) * 72, 1);
    expect(bytes.length).toBeLessThan(2_000_000);
  });
  it("refuses empty input and layouts that do not fit", async () => {
    await expect(renderLabelPdf({ spec, items: [], siteUrl: SITE, company: "X", title: "t" })).rejects.toThrow();
    await expect(renderLabelPdf({ spec: { ...spec, labelWidthMm: 210, labelHeightMm: 297 }, items: makeItems(1), siteUrl: SITE, company: "X", title: "t" })).rejects.toThrow(/does not fit/);
  });
  it("is fast enough for 500-label chunks", async () => {
    const t0 = Date.now();
    await renderLabelPdf({ spec, items: makeItems(500), siteUrl: SITE, company: "Axiom Motive", title: "t" });
    expect(Date.now() - t0).toBeLessThan(8000);
  }, 20_000);
});

const hasPdftoppm = spawnSync("pdftoppm", ["-v"]).status !== null;

describe.skipIf(!hasPdftoppm)("PDF -> raster -> QR decode (proves the printed codes are scannable)", () => {
  it.each([{ dpi: 300 }, { dpi: 200 }])("every QR on a full sheet decodes to its own URL at $dpi dpi", async ({ dpi }) => {
    const items = makeItems(24);
    const bytes = await renderLabelPdf({ spec, items, siteUrl: SITE, company: "Axiom Motive", title: "t" });
    const decoded = decodeSheet(bytes, spec, { dpi });
    expect(decoded).toHaveLength(24);
    decoded.forEach((d, i) => expect(d, `label ${i}`).toBe(buildVerificationUrl(SITE, items[i]!.token)));
  }, 60_000);
});
