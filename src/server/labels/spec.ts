import { z } from "zod";

const mm = (min: number, max: number) => z.coerce.number().min(min).max(max);

export const PAGES = { A4: { w: 210, h: 297 }, LETTER: { w: 215.9, h: 279.4 } } as const;
export const MIN_MODULE_MM = 0.33; // smallest module most thermal-transfer printers reproduce reliably
export const QUIET_ZONE_MODULES = 4;

export const labelSpecSchema = z.object({
  page: z.enum(["A4", "LETTER"]).default("A4"),
  labelWidthMm: mm(20, 200).default(50),
  labelHeightMm: mm(15, 200).default(30),
  qrSizeMm: mm(10, 100).default(22),
  marginTopMm: mm(0, 50).default(10),
  marginLeftMm: mm(0, 50).default(10),
  gapXMm: mm(0, 30).default(3),
  gapYMm: mm(0, 30).default(3),
  qrErrorCorrection: z.enum(["M", "Q", "H"]).default("Q"),
  cutGuides: z.coerce.boolean().default(true),
});
export type LabelSpec = z.infer<typeof labelSpecSchema>;

export type SheetLayout = { cols: number; rows: number; perPage: number; pageW: number; pageH: number };

export function sheetLayout(spec: LabelSpec): SheetLayout {
  const { w, h } = PAGES[spec.page];
  const cols = Math.max(0, Math.floor((w - spec.marginLeftMm + spec.gapXMm) / (spec.labelWidthMm + spec.gapXMm)));
  const rows = Math.max(0, Math.floor((h - spec.marginTopMm + spec.gapYMm) / (spec.labelHeightMm + spec.gapYMm)));
  return { cols, rows, perPage: cols * rows, pageW: w, pageH: h };
}

export type SpecCheck = { ok: boolean; errors: string[]; warnings: string[]; layout: SheetLayout; moduleMm: number | null };

/**
 * Physical-sense checks. `qrSizeMm` is the printed symbol WITHOUT its quiet zone; the 4-module
 * quiet zone is added around it and must also fit inside the label.
 */
export function checkSpec(spec: LabelSpec, qrModules: number | null): SpecCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const layout = sheetLayout(spec);
  if (layout.perPage < 1) errors.push("No label fits on the page with these margins and sizes.");

  const moduleMm = qrModules ? spec.qrSizeMm / qrModules : null;
  const quiet = moduleMm ? moduleMm * QUIET_ZONE_MODULES : 0;
  const needed = spec.qrSizeMm + 2 * quiet;
  if (moduleMm && needed > spec.labelHeightMm) errors.push(`The QR code plus its quiet zone needs ${needed.toFixed(1)} mm of height, but the label is only ${spec.labelHeightMm} mm tall.`);
  if (moduleMm && needed + 22 > spec.labelWidthMm) errors.push("The label is too narrow to fit the QR code and the serial number beside it. Make it wider or the QR code smaller.");
  if (moduleMm && moduleMm < MIN_MODULE_MM) errors.push(`Each QR module would print ${moduleMm.toFixed(2)} mm wide. Below ${MIN_MODULE_MM} mm many printers cannot reproduce it reliably. Increase the QR size.`);
  else if (moduleMm && moduleMm < 0.4) warnings.push(`Modules are ${moduleMm.toFixed(2)} mm wide. That is small: print a test sheet and scan it on iPhone and Android before a full run.`);
  if (spec.qrErrorCorrection === "M") warnings.push("Error correction M tolerates less scuffing than Q or H.");
  return { ok: errors.length === 0, errors, warnings, layout, moduleMm };
}
