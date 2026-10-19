import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand/brand-mark";

/**
 * Illustration of a physical part label: brand, QR code, serial and printed backup code.
 * Purely decorative/explanatory; the QR path is generated server-side.
 */
export function PartLabel({
  qr, company, serial = "AXM-00012345", code = ["ABCD-EFGH-JKMN", "PQRS-TVWX"], scan = false, className,
}: {
  qr: { size: number; d: string }; company: string; serial?: string; code?: [string, string]; scan?: boolean; className?: string;
}) {
  const q = 4; // quiet zone, modules
  const px = 100 / (qr.size + q * 2);
  return (
    <svg viewBox="0 0 300 184" className={cn("h-auto w-full", className)} aria-hidden fontFamily="var(--font-sans)">
      <rect x="1" y="1" width="298" height="182" rx="12" fill="#fff" stroke="var(--line-strong)" strokeWidth="1.5" />
      {/* header */}
      <g transform="translate(18 14) scale(0.62)"><BrandMarkSvg /></g>
      <text x="42" y="30" fontSize="11" fontWeight="600" letterSpacing="0.6" fill="var(--ink)">{company.toUpperCase()}</text>
      <line x1="18" y1="44" x2="282" y2="44" stroke="var(--line)" />
      {/* QR with camera focus corners */}
      <g transform="translate(18 56)">
        <rect width="100" height="100" fill="#fff" />
        <g transform={`translate(${q * px} ${q * px}) scale(${px})`}><path d={qr.d} fill="var(--ink)" shapeRendering="crispEdges" /></g>
        {scan ? (
          <g style={{ ["--scan-distance" as string]: "88px" }}>
            <rect className="scan-line" x="-2" y="4" width="104" height="3" rx="1.5" fill="var(--teal)" opacity="0.85" />
          </g>
        ) : null}
        {[[-8, -8, 1, 1], [108, -8, -1, 1], [-8, 108, 1, -1], [108, 108, -1, -1]].map(([x, y, sx, sy], i) => (
          <path key={i} d="M0 12V2a2 2 0 0 1 2-2h10" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" transform={`translate(${x} ${y}) scale(${sx} ${sy})`} />
        ))}
      </g>
      {/* text block */}
      <text x="142" y="72" fontSize="8" fontWeight="600" letterSpacing="1.4" fill="var(--quiet)">SERIAL</text>
      <text x="142" y="90" fontSize="13.5" fontFamily="var(--font-mono)" fontWeight="500" fill="var(--ink)">{serial}</text>
      <text x="142" y="118" fontSize="8" fontWeight="600" letterSpacing="1.4" fill="var(--quiet)">BACKUP CODE</text>
      <text x="142" y="135" fontSize="11.5" fontFamily="var(--font-mono)" fill="var(--body)">{code[0]}</text>
      <text x="142" y="151" fontSize="11.5" fontFamily="var(--font-mono)" fill="var(--body)">{code[1]}</text>
      <text x="18" y="173" fontSize="7" fontWeight="600" letterSpacing="1.6" fill="var(--quiet)">SCAN WITH YOUR PHONE CAMERA</text>
    </svg>
  );
}

function BrandMarkSvg() {
  return (
    <g>
      <path d="M16 2.5 4.5 6.6v8.6c0 6.7 4.7 11.9 11.5 14.3V2.5Z" fill="var(--brand)" />
      <path d="M16 2.5 27.5 6.6v8.6c0 6.7-4.7 11.9-11.5 14.3V2.5Z" fill="var(--brand-deep)" />
      <path d="m10.4 15.8 4 4 7.4-8.1" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
}
export { BrandMark };
