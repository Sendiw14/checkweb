import { Fingerprint, ScanLine } from "lucide-react";
import { PartLabel } from "@/components/brand/part-label";

/**
 * Editorial hero illustration: a dimensional, precision-machined rotor and a
 * serialized label. The label QR points only to the public verification entry;
 * the visual must never imply that a real part has already passed verification.
 */
export function HeroVisual({ qr, company }: { qr: { size: number; d: string }; company: string }) {
  const slots = Array.from({ length: 24 }, (_, i) => i * 15);
  const ticks = Array.from({ length: 60 }, (_, i) => i * 6);
  const bolts = Array.from({ length: 5 }, (_, i) => i * 72 - 90);

  return (
    <div
      className="hero-art relative mx-auto aspect-[1/0.94] w-full max-w-[36rem]"
      role="img"
      aria-label={`Illustration of a precision-machined automotive part with a serialized QR label for ${company}`}
    >
      <div className="hero-art-glow absolute inset-[4%] rounded-full" aria-hidden />

      <svg viewBox="0 0 500 500" className="hero-rotor absolute inset-0 size-full" aria-hidden>
        <defs>
          <radialGradient id="rotor-metal" cx="28%" cy="20%" r="83%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="31%" stopColor="#F3F6FA" />
            <stop offset="64%" stopColor="#D5DDE8" />
            <stop offset="83%" stopColor="#B9C5D4" />
            <stop offset="100%" stopColor="#EDF1F6" />
          </radialGradient>
          <linearGradient id="rotor-edge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="42%" stopColor="#9BA9BB" />
            <stop offset="68%" stopColor="#EAF0F6" />
            <stop offset="100%" stopColor="#8D9BAE" />
          </linearGradient>
          <radialGradient id="hub-metal" cx="35%" cy="25%" r="85%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="62%" stopColor="#DDE5EF" />
            <stop offset="100%" stopColor="#AAB7C8" />
          </radialGradient>
          <pattern id="rotor-brush" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M0 1H4" stroke="#77879B" strokeOpacity=".16" strokeWidth=".6" />
          </pattern>
          <filter id="rotor-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#172B4D" floodOpacity=".15" />
          </filter>
        </defs>

        <circle cx="258" cy="248" r="232" fill="var(--brand-soft)" opacity=".68" />
        <circle cx="258" cy="248" r="220" fill="none" stroke="var(--brand)" strokeOpacity=".12" strokeDasharray="2 8" />

        <g filter="url(#rotor-shadow)">
          <circle cx="250" cy="245" r="211" fill="url(#rotor-edge)" />
          <circle cx="250" cy="245" r="202" fill="url(#rotor-metal)" stroke="#FFFFFF" strokeOpacity=".95" strokeWidth="2.5" />
          <circle cx="250" cy="245" r="194" fill="url(#rotor-brush)" opacity=".46" />
          <circle cx="250" cy="245" r="183" fill="none" stroke="#8797AA" strokeOpacity=".4" strokeWidth="1.3" />
          <circle cx="250" cy="245" r="171" fill="none" stroke="#FFFFFF" strokeOpacity=".9" strokeWidth="2" />

          {ticks.map((a) => (
            <line
              key={a}
              x1="250"
              y1={a % 30 === 0 ? 43 : 48}
              x2="250"
              y2={a % 30 === 0 ? 58 : 54}
              stroke="#64758C"
              strokeOpacity={a % 30 === 0 ? ".65" : ".26"}
              strokeWidth={a % 30 === 0 ? "1.6" : "1"}
              transform={`rotate(${a} 250 245)`}
            />
          ))}

          <circle cx="250" cy="245" r="153" fill="none" stroke="#A8B5C6" strokeWidth="13" strokeOpacity=".28" />
          <circle cx="250" cy="245" r="142" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeOpacity=".92" />
          {slots.map((a) => (
            <g key={a} transform={`rotate(${a} 250 245)`}>
              <ellipse cx="250" cy="112" rx="5.1" ry="12.5" fill="#94A2B5" opacity=".63" />
              <ellipse cx="250" cy="112" rx="2.9" ry="9.1" fill="#EEF2F7" />
            </g>
          ))}

          <circle cx="250" cy="245" r="100" fill="url(#rotor-edge)" />
          <circle cx="250" cy="245" r="91" fill="url(#rotor-metal)" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="250" cy="245" r="78" fill="url(#hub-metal)" stroke="#96A5B7" strokeOpacity=".45" strokeWidth="1.2" />
          <circle cx="250" cy="245" r="59" fill="none" stroke="#FFFFFF" strokeWidth="2.2" />
          <circle cx="250" cy="245" r="45" fill="url(#rotor-edge)" />
          <circle cx="250" cy="245" r="36" fill="url(#hub-metal)" stroke="#FFFFFF" strokeWidth="2" />

          {bolts.map((a) => (
            <g key={a} transform={`translate(${250 + 62 * Math.cos((a * Math.PI) / 180)} ${245 + 62 * Math.sin((a * Math.PI) / 180)})`}>
              <circle r="9.1" fill="#A4B1C1" opacity=".8" />
              <circle cy="-1" r="6.7" fill="#F9FBFD" stroke="#8B9AAF" strokeWidth="1.1" />
              <circle r="2.2" fill="#AAB6C5" />
            </g>
          ))}
          <circle cx="250" cy="245" r="19" fill="url(#hub-metal)" stroke="#8B9AAF" strokeWidth="1.4" />
          <circle cx="250" cy="245" r="7" fill="#F9FBFD" stroke="#8B9AAF" strokeWidth="1.2" />
        </g>

        <path d="M250 24 A221 221 0 0 1 466 200" fill="none" stroke="var(--brand)" strokeOpacity=".45" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M35 304 A221 221 0 0 0 168 452" fill="none" stroke="var(--teal)" strokeOpacity=".45" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M250 245 L446 245" fill="none" stroke="var(--line-strong)" strokeDasharray="3 6" strokeWidth="1" />
      </svg>

      <p className="hero-art-index absolute right-[4%] top-[4%] hidden sm:block">
        <span>FIELD NOTE</span>
        <strong>01 / SERIALIZATION</strong>
      </p>

      <div className="hero-art-label absolute bottom-[2%] left-0 w-[72%] -rotate-[4deg]">
        <PartLabel qr={qr} company={company} scan />
      </div>

      <div className="hero-art-callout absolute left-[1%] top-[31%] flex items-center gap-3 rounded-xl border border-line bg-white/95 px-3 py-3 shadow-[0_12px_34px_-16px_rgba(23,43,77,0.35)] backdrop-blur-sm sm:px-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Fingerprint aria-hidden className="size-5" strokeWidth={1.7} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-small font-semibold text-ink">One code per part</span>
          <span className="mt-1 block text-caption text-quiet">Serialized for verification</span>
        </span>
      </div>

      <div className="hero-art-footnote absolute bottom-[3%] right-[1%] hidden items-center gap-2 font-mono text-[0.65rem] tracking-[0.12em] text-quiet sm:flex">
        <ScanLine aria-hidden className="size-3.5 text-teal" />
        <span>PHYSICAL LABEL · DIGITAL RECORD</span>
      </div>
    </div>
  );
}
