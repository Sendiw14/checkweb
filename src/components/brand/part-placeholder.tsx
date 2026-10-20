import { cn } from "@/lib/utils";

/**
 * Category-neutral fallback for products without a photograph.
 * It deliberately depicts a serialized package/unit, not a specific spare part.
 */
export function PartPlaceholder({ className, label = "No photo available for this product" }: { className?: string; label?: string }) {
  const cornerMarks = [
    { x: 18, y: 18, sx: 1, sy: 1 },
    { x: 102, y: 18, sx: -1, sy: 1 },
    { x: 18, y: 102, sx: 1, sy: -1 },
    { x: 102, y: 102, sx: -1, sy: -1 },
  ];

  return (
    <svg
      viewBox="0 0 120 120"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: false })}
      className={cn("size-full", className)}
    >
      <defs>
        <linearGradient id="unit-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E5EBF3" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill="var(--cloud)" />
      <circle cx="60" cy="59" r="47" fill="#FFFFFF" opacity=".64" />
      <circle cx="60" cy="59" r="44" fill="none" stroke="var(--line-strong)" strokeOpacity=".6" strokeDasharray="1.5 5" />
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M60 25 89 41.5 60 58 31 41.5Z" fill="var(--brand-soft)" stroke="#8EA5D6" strokeWidth="1.3" />
        <path d="M31 41.5 60 58V91L31 74.5Z" fill="url(#unit-face)" stroke="#AAB8CA" strokeWidth="1.3" />
        <path d="M60 58 89 41.5V74.5L60 91Z" fill="#D7E1EF" stroke="#93A5BB" strokeWidth="1.3" />
        <path d="M60 25V58" stroke="#FFFFFF" strokeOpacity=".9" strokeWidth="1.5" />
        <path d="M42 47.5 60 58 78 47.5" fill="none" stroke="#7390C4" strokeWidth="1.1" />
        <rect x="43" y="65" width="13" height="15" rx="1.8" fill="#FFFFFF" stroke="#9AABC0" strokeWidth="1" />
        <path d="M46 69H53M46 72H53M46 75H51" stroke="var(--brand)" strokeWidth="1" />
        <circle cx="69.5" cy="67.5" r="4.5" fill="#FFFFFF" stroke="var(--teal)" strokeWidth="1.2" />
        <path d="m67.3 67.5 1.5 1.5 2.8-3.1" fill="none" stroke="var(--teal)" strokeWidth="1.2" />
      </g>
      {cornerMarks.map((mark, i) => (
        <path key={i} d="M0 8V2a2 2 0 0 1 2-2h6" transform={`translate(${mark.x} ${mark.y}) scale(${mark.sx} ${mark.sy})`} fill="none" stroke="var(--line-strong)" strokeWidth="1.1" />
      ))}
    </svg>
  );
}
