import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { sheetLayout, type LabelSpec } from "@/server/labels/spec";

/**
 * Independent verification of a generated label PDF: rasterise it with poppler, crop every
 * label cell using the same geometry as the renderer, and decode each QR with jsQR.
 * Returns the decoded text per label slot (null when a QR could not be read).
 */
export function decodeSheet(pdf: Uint8Array, spec: LabelSpec, opts: { page?: number; dpi?: number; count?: number } = {}): (string | null)[] {
  const dpi = opts.dpi ?? 300;
  const pageNo = opts.page ?? 1;
  const dir = mkdtempSync(join(tmpdir(), "decode-"));
  try {
    writeFileSync(join(dir, "s.pdf"), pdf);
    execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(pageNo), "-l", String(pageNo), "-png", join(dir, "s.pdf"), join(dir, "p")]);
    const png = PNG.sync.read(readFileSync(join(dir, readdirSync(dir).find((f) => f.endsWith(".png"))!)));
    const px = (mm: number) => Math.round((mm / 25.4) * dpi);
    const layout = sheetLayout(spec);
    const out: (string | null)[] = [];
    const n = Math.min(opts.count ?? layout.perPage, layout.perPage);
    for (let i = 0; i < n; i++) {
      const x = px(spec.marginLeftMm + (i % layout.cols) * (spec.labelWidthMm + spec.gapXMm));
      const y = px(spec.marginTopMm + Math.floor(i / layout.cols) * (spec.labelHeightMm + spec.gapYMm));
      const w = px(spec.labelWidthMm);
      const h = px(spec.labelHeightMm);
      const crop = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const s = ((y + yy) * png.width + (x + xx)) * 4;
        const d = (yy * w + xx) * 4;
        crop[d] = png.data[s]!; crop[d + 1] = png.data[s + 1]!; crop[d + 2] = png.data[s + 2]!; crop[d + 3] = 255;
      }
      out.push(jsQR(crop, w, h)?.data ?? null);
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const tokenFromUrl = (url: string) => url.slice(url.indexOf("#") + 1);
