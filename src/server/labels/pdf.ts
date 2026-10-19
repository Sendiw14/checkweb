import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatManualCode } from "@/lib/credential-format";
import { buildVerificationUrl } from "@/server/security/tokens";
import { qrMatrix } from "@/server/qr";
import { PAGES, QUIET_ZONE_MODULES, sheetLayout, type LabelSpec } from "@/server/labels/spec";

export type LabelItem = { serial: string; token: string; code: string; productName: string; partNumber: string };

const MM = 72 / 25.4; // PDF points per millimetre
const INK = rgb(0.09, 0.17, 0.3); // brand navy
const QUIET = rgb(0.4, 0.44, 0.52);

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

/**
 * Renders print-ready label sheets. Everything is vector (QR modules are exact rectangles),
 * sized in millimetres, with no scaling on print. The PDF CONTAINS LIVE CREDENTIALS: it must
 * only ever be written to private storage and handed out through audited downloads.
 */
export async function renderLabelPdf(args: { spec: LabelSpec; items: LabelItem[]; siteUrl: string; company: string; title: string }): Promise<Uint8Array> {
  const { spec, items, siteUrl, company } = args;
  const layout = sheetLayout(spec);
  if (layout.perPage < 1) throw new Error("label layout does not fit on the page");

  const doc = await PDFDocument.create();
  doc.setTitle(args.title);
  doc.setProducer("Authenticity platform label renderer");
  doc.setCreator("Authenticity platform");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  const monoRegular = await doc.embedFont(StandardFonts.Courier);

  const pageW = PAGES[spec.page].w * MM;
  const pageH = PAGES[spec.page].h * MM;
  const lw = spec.labelWidthMm * MM;
  const lh = spec.labelHeightMm * MM;

  let page: PDFPage | null = null;
  for (let i = 0; i < items.length; i++) {
    const slot = i % layout.perPage;
    if (slot === 0) {
      page = doc.addPage([pageW, pageH]);
      // Registration tick marks at the page corners help the operator confirm "actual size".
      const t = 4 * MM;
      for (const [x, y] of [[3 * MM, 3 * MM], [pageW - 3 * MM, 3 * MM], [3 * MM, pageH - 3 * MM], [pageW - 3 * MM, pageH - 3 * MM]] as const) {
        page.drawLine({ start: { x: x - t / 2, y }, end: { x: x + t / 2, y }, thickness: 0.3, color: QUIET });
        page.drawLine({ start: { x, y: y - t / 2 }, end: { x, y: y + t / 2 }, thickness: 0.3, color: QUIET });
      }
      page.drawText(`${company} · ${items.length > 0 ? `serials ${items[i]!.serial} to ${items[Math.min(i + layout.perPage, items.length) - 1]!.serial}` : ""}`, { x: 10 * MM, y: pageH - 5.5 * MM, size: 6, font: regular, color: QUIET });
    }
    const col = slot % layout.cols;
    const row = Math.floor(slot / layout.cols);
    const x0 = (spec.marginLeftMm + col * (spec.labelWidthMm + spec.gapXMm)) * MM;
    const yTop = pageH - (spec.marginTopMm + row * (spec.labelHeightMm + spec.gapYMm)) * MM;
    drawLabel(doc, page!, { x0, y0: yTop - lh, lw, lh }, items[i]!, spec, siteUrl, company, { regular, bold, mono, monoRegular });
  }
  if (items.length === 0) throw new Error("no labels to render");
  return doc.save();
}

function drawLabel(
  doc: PDFDocument, page: PDFPage, box: { x0: number; y0: number; lw: number; lh: number }, item: LabelItem, spec: LabelSpec, siteUrl: string, company: string,
  f: { regular: PDFFont; bold: PDFFont; mono: PDFFont; monoRegular: PDFFont },
) {
  const { x0, y0, lw, lh } = box;
  if (spec.cutGuides) page.drawRectangle({ x: x0, y: y0, width: lw, height: lh, borderColor: rgb(0.8, 0.82, 0.86), borderWidth: 0.25, borderDashArray: [2, 2] });

  // QR: exact module grid, quiet zone left white.
  const m = qrMatrix(buildVerificationUrl(siteUrl, item.token), spec.qrErrorCorrection);
  const mod = (spec.qrSizeMm * MM) / m.size;
  const quiet = QUIET_ZONE_MODULES * mod;
  const pad = Math.max(1.2 * MM, 0);
  const qx = x0 + pad;
  const qy = y0 + (lh - spec.qrSizeMm * MM) / 2;
  // One content stream per QR (a single string of `re` operators and one fill) is orders of
  // magnitude cheaper than one drawRectangle object per run.
  let ops = "q 0 0 0 rg\n";
  const n = (v: number) => v.toFixed(3);
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.isDark(x, y)) { x++; continue; }
      let run = 1;
      while (x + run < m.size && m.isDark(x + run, y)) run++;
      // Overlap by a hair to avoid hairline seams between adjacent rectangles in some viewers.
      ops += `${n(qx + x * mod)} ${n(qy + (m.size - 1 - y) * mod - 0.01)} ${n(run * mod + 0.01)} ${n(mod + 0.02)} re\n`;
      x += run;
    }
  }
  ops += "f Q\n";
  page.node.addContentStream(doc.context.register(doc.context.stream(ops)));

  // Text column to the right of the QR symbol + its quiet zone.
  const tx = qx + spec.qrSizeMm * MM + quiet + 0.8 * MM;
  const tw = x0 + lw - tx - 1.2 * MM;
  let ty = y0 + lh - 3.2 * MM;
  page.drawText(fit(company.toUpperCase(), f.bold, 6.2, tw), { x: tx, y: ty, size: 6.2, font: f.bold, color: INK });
  ty -= 3.3 * MM;
  page.drawText(fit(item.productName, f.regular, 5.6, tw), { x: tx, y: ty, size: 5.6, font: f.regular, color: QUIET });
  ty -= 2.7 * MM;
  page.drawText(fit(`P/N ${item.partNumber}`, f.regular, 5.6, tw), { x: tx, y: ty, size: 5.6, font: f.regular, color: QUIET });
  ty -= 4.6 * MM;
  page.drawText("SERIAL", { x: tx, y: ty + 2.4 * MM, size: 4.4, font: f.bold, color: QUIET });
  const serialSize = Math.min(8.5, (tw / f.mono.widthOfTextAtSize(item.serial, 1)) * 0.98);
  page.drawText(item.serial, { x: tx, y: ty, size: serialSize, font: f.mono, color: INK });
  ty -= 4.8 * MM;
  const groups = formatManualCode(item.code).split("-");
  page.drawText("BACKUP CODE", { x: tx, y: ty + 2.4 * MM, size: 4.4, font: f.bold, color: QUIET });
  const l1 = groups.slice(0, 3).join("-");
  const l2 = groups.slice(3).join("-");
  const codeSize = Math.min(6.4, (tw / f.monoRegular.widthOfTextAtSize(l1, 1)) * 0.98);
  page.drawText(l1, { x: tx, y: ty, size: codeSize, font: f.monoRegular, color: INK });
  page.drawText(l2, { x: tx, y: ty - codeSize * 1.25, size: codeSize, font: f.monoRegular, color: INK });
}
