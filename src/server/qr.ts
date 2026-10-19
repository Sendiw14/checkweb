import "server-only";
import QRCode from "qrcode";

export type QrEc = "L" | "M" | "Q" | "H";

export type QrMatrix = { size: number; isDark: (x: number, y: number) => boolean };

export function qrMatrix(text: string, ec: QrEc = "Q"): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: ec });
  const { size, data } = qr.modules;
  return { size, isDark: (x, y) => data[y * size + x] === 1 };
}

/** SVG path data for the dark modules (row runs merged), in module units. */
export function qrPath(text: string, ec: QrEc = "Q"): { size: number; d: string } {
  const m = qrMatrix(text, ec);
  let d = "";
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.isDark(x, y)) { x++; continue; }
      let run = 1;
      while (x + run < m.size && m.isDark(x + run, y)) run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return { size: m.size, d };
}
