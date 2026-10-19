/**
 * Writes a TEST sheet of QR labels so you can check print scale, stock alignment and scannability
 * with real phones before a production run. Nothing is stored anywhere:
 *
 *   - the codes on this sheet are random and are NOT in any database,
 *   - scanning one opens your /verify page and honestly answers "We can't match this code",
 *   - every label is marked SAMPLE so it can't be mistaken for stock.
 *
 *   pnpm labels:sample [--count 24] [--out .local/sample-labels.pdf] [--site https://verify.example.com]
 *
 * To exercise the whole path with codes that DO verify, use the staff workspace: register a batch in a
 * development database, generate labels, print, apply, pass QC and release (see docs/LABEL-PRINTING.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderLabelPdf, type LabelItem } from "@/server/labels/pdf";
import { labelSpecSchema, checkSpec } from "@/server/labels/spec";
import { generateManualCode, generateToken } from "@/server/security/tokens";
import { qrMatrix } from "@/server/qr";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function main() {
  const count = Math.max(1, Math.min(500, Number(arg("count", "24")) || 24));
  const out = resolve(process.cwd(), arg("out", ".local/sample-labels.pdf"));
  const siteUrl = arg("site", process.env.PUBLIC_SITE_URL ?? "http://localhost:3000");
  const spec = labelSpecSchema.parse({});

  const sample: LabelItem[] = Array.from({ length: count }, (_, i) => ({
    serial: `SAMPLE-${String(i + 1).padStart(5, "0")}`,
    token: generateToken(),
    code: generateManualCode(),
    productName: "SAMPLE: not a real part",
    partNumber: "TEST-SHEET",
  }));

  const probe = qrMatrix(`${siteUrl.replace(/\/+$/, "")}/verify#${sample[0]!.token}`, spec.qrErrorCorrection);
  const check = checkSpec(spec, probe.size);
  for (const w of check.warnings) process.stderr.write(`warning: ${w}\n`);
  if (!check.ok) {
    for (const e of check.errors) process.stderr.write(`error: ${e}\n`);
    process.exitCode = 1;
    return;
  }

  const pdf = await renderLabelPdf({ spec, items: sample, siteUrl, company: "SAMPLE SHEET", title: "QR label test sheet" });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pdf);
  process.stdout.write(
    `Wrote ${count} sample labels to ${out}\n` +
    `  layout: ${check.layout.cols} x ${check.layout.rows} per ${spec.page} sheet, QR module ${check.moduleMm?.toFixed(2)} mm\n` +
    `  Print at 100% / "Actual size" and scan a few labels with an iPhone and an Android phone.\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
