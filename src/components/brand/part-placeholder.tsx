import { cn } from "@/lib/utils";

/** Elegant fallback when a product has no photo: a brake-rotor line drawing. */
export function PartPlaceholder({ className, label = "No photo available" }: { className?: string; label?: string }) {
  const slots = Array.from({ length: 20 }, (_, i) => i * 18);
  const bolts = Array.from({ length: 5 }, (_, i) => i * 72 - 90);
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={label} className={cn("size-full", className)}>
      <rect width="120" height="120" fill="var(--cloud)" />
      <g fill="none" stroke="var(--brand)" strokeLinecap="round" opacity="0.9">
        <circle cx="60" cy="60" r="46" strokeWidth="1.6" />
        <circle cx="60" cy="60" r="40" strokeWidth="0.8" opacity="0.5" />
        <circle cx="60" cy="60" r="17" strokeWidth="1.4" />
        {slots.map((a) => (
          <line key={a} x1="60" y1="24" x2="60" y2="29" strokeWidth="1.4" transform={`rotate(${a} 60 60)`} opacity="0.55" />
        ))}
        {bolts.map((a) => (
          <circle key={a} cx={60 + 9 * Math.cos((a * Math.PI) / 180)} cy={60 + 9 * Math.sin((a * Math.PI) / 180)} r="2" strokeWidth="1.2" />
        ))}
        <circle cx="60" cy="60" r="4" strokeWidth="1.2" />
      </g>
    </svg>
  );
}
