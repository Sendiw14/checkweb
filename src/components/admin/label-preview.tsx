import { PAGES, QUIET_ZONE_MODULES, sheetLayout, type LabelSpec } from "@/server/labels/spec";
import { cn } from "@/lib/utils";

type Qr = { size: number; d: string };

/** True-to-scale drawing of one label (millimetres) so the operator sees exactly what will print. */
export function LabelPreview({ spec, qr, className }: { spec: LabelSpec; qr: Qr; className?: string }) {
  const mod = spec.qrSizeMm / qr.size;
  const quiet = mod * QUIET_ZONE_MODULES;
  const qx = 1.2;
  const qy = (spec.labelHeightMm - spec.qrSizeMm) / 2;
  const tx = qx + spec.qrSizeMm + quiet + 0.8;
  return (
    <svg viewBox={`0 0 ${spec.labelWidthMm} ${spec.labelHeightMm}`} className={cn("h-auto w-full rounded-[1.5px] border border-line-strong bg-white", className)} role="img" aria-label={`Label preview, ${spec.labelWidthMm} by ${spec.labelHeightMm} millimetres`} fontFamily="var(--font-sans)">
      {/* quiet zone */}
      <rect x={qx - quiet} y={qy - quiet} width={spec.qrSizeMm + 2 * quiet} height={spec.qrSizeMm + 2 * quiet} fill="none" stroke="var(--teal)" strokeWidth="0.15" strokeDasharray="0.8 0.8" />
      <g transform={`translate(${qx} ${qy}) scale(${mod})`}><path d={qr.d} fill="#000" shapeRendering="crispEdges" /></g>
      <text x={tx} y="4.2" fontSize="2.1" fontWeight="700" fill="var(--ink)">AXIOM MOTIVE</text>
      <text x={tx} y="7.6" fontSize="1.9" fill="var(--quiet)">Product name</text>
      <text x={tx} y="10.3" fontSize="1.9" fill="var(--quiet)">P/N BP-2041</text>
      <text x={tx} y="14.6" fontSize="1.5" fontWeight="700" fill="var(--quiet)">SERIAL</text>
      <text x={tx} y="17.8" fontSize="3" fontFamily="var(--font-mono)" fontWeight="700" fill="var(--ink)">AXM-00012345</text>
      <text x={tx} y="22" fontSize="1.5" fontWeight="700" fill="var(--quiet)">BACKUP CODE</text>
      <text x={tx} y="24.6" fontSize="2.1" fontFamily="var(--font-mono)" fill="var(--ink)">ABCD-EFGH-JKMN</text>
      <text x={tx} y="27.2" fontSize="2.1" fontFamily="var(--font-mono)" fill="var(--ink)">PQRS-TVWX</text>
    </svg>
  );
}

export function SheetPreview({ spec, className }: { spec: LabelSpec; className?: string }) {
  const { w, h } = PAGES[spec.page];
  const l = sheetLayout(spec);
  const cells = Array.from({ length: l.perPage }, (_, i) => ({ x: spec.marginLeftMm + (i % l.cols) * (spec.labelWidthMm + spec.gapXMm), y: spec.marginTopMm + Math.floor(i / l.cols) * (spec.labelHeightMm + spec.gapYMm) }));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-auto w-full max-w-44 rounded-sm border border-line-strong bg-white shadow-sm", className)} role="img" aria-label={`Sheet layout: ${l.cols} columns by ${l.rows} rows, ${l.perPage} labels per ${spec.page} page`}>
      {cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width={spec.labelWidthMm} height={spec.labelHeightMm} rx="1" fill={i === 0 ? "var(--brand-soft)" : "var(--cloud)"} stroke={i === 0 ? "var(--brand)" : "var(--line-strong)"} strokeWidth="0.5" />)}
    </svg>
  );
}
