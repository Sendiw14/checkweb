import { Archive, CircleAlert, Clock, Pause, ScanLine, SearchX, ShieldAlert, ShieldCheck, ShieldX, Siren, Timer, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IconKey, Tone } from "@/lib/verification-copy";

const ICONS = {
  "shield-check": ShieldCheck, "shield-alert": ShieldAlert, "shield-x": ShieldX, siren: Siren, pause: Pause, clock: Clock,
  archive: Archive, "search-x": SearchX, scan: ScanLine, "wifi-off": WifiOff, timer: Timer, "circle-alert": CircleAlert,
} as const;

export const toneStyles: Record<Tone, { text: string; soft: string; line: string; ring: string; bar: string }> = {
  success: { text: "text-success", soft: "bg-success-soft", line: "border-success-line", ring: "stroke-success", bar: "bg-success" },
  warning: { text: "text-warning", soft: "bg-warning-soft", line: "border-warning-line", ring: "stroke-warning", bar: "bg-warning" },
  danger: { text: "text-danger", soft: "bg-danger-soft", line: "border-danger-line", ring: "stroke-danger", bar: "bg-danger" },
  neutral: { text: "text-body", soft: "bg-subtle", line: "border-line", ring: "stroke-quiet", bar: "bg-quiet" },
  brand: { text: "text-brand", soft: "bg-brand-soft", line: "border-[#c7d9f8]", ring: "stroke-brand", bar: "bg-brand" },
};

/**
 * The status seal: an enamel-badge style ring around a status icon. The ring draws in
 * once on arrival (CSS only: never loops, never delays the text, off for reduced motion).
 * Meaning is carried by the icon and the heading text, never by colour alone.
 */
export function StatusSeal({ tone, icon, size = 88, className, animate = true }: { tone: Tone; icon: IconKey; size?: number; className?: string; animate?: boolean }) {
  const Icon = ICONS[icon];
  const s = toneStyles[tone];
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
        <circle cx="50" cy="50" r="46" className={cn("fill-none stroke-current opacity-[0.16]", s.text)} strokeWidth="3" />
        <circle cx="50" cy="50" r="38" className={cn("fill-none stroke-current opacity-[0.1]", s.text)} strokeWidth="1.5" strokeDasharray="1.5 4.5" />
        <circle cx="50" cy="50" r="46" pathLength={1} className={cn("fill-none", s.ring, animate && "ring-draw")} strokeWidth="3" strokeLinecap="round" strokeDasharray={animate ? undefined : "1"} />
      </svg>
      <div className={cn("grid place-items-center rounded-full", s.soft, s.text, animate && "seal-pop")} style={{ width: size * 0.64, height: size * 0.64 }}>
        <Icon style={{ width: size * 0.34, height: size * 0.34 }} strokeWidth={1.7} />
      </div>
    </div>
  );
}
