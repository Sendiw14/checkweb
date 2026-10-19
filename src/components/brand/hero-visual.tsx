import { CheckCircle2 } from "lucide-react";
import { PartLabel } from "@/components/brand/part-label";

/**
 * Hero composition: a brake rotor in fine line work with a part label laid over it,
 * a camera-focus frame on the QR and a "Code recognized" chip. The label's QR is real but
 * encodes only the public /verify page, so scanning the hero is harmless.
 */
export function HeroVisual({ qr, company }: { qr: { size: number; d: string }; company: string }) {
  const slots = Array.from({ length: 36 }, (_, i) => i * 10);
  const bolts = Array.from({ length: 5 }, (_, i) => i * 72 - 90);
  return (
    <div className="relative mx-auto aspect-[1/0.92] w-full max-w-[34rem]" role="img" aria-label={`Illustration of a ${company} part label with a QR code, serial number and backup code, shown over a brake rotor`}>
      <svg viewBox="0 0 400 400" className="absolute right-0 top-0 w-[86%]" aria-hidden>
        <defs>
          <radialGradient id="rotor-fade" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="var(--brand-soft)" stopOpacity="0.85" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="188" fill="url(#rotor-fade)" />
        <g fill="none" stroke="var(--brand)" strokeLinecap="round">
          <circle cx="200" cy="200" r="184" strokeWidth="2.2" />
          <circle cx="200" cy="200" r="170" strokeWidth="1" opacity="0.45" />
          <circle cx="200" cy="200" r="104" strokeWidth="1" opacity="0.45" />
          <circle cx="200" cy="200" r="66" strokeWidth="2" />
          {slots.map((a) => <line key={a} x1="200" y1="46" x2="200" y2="82" strokeWidth="1.6" opacity="0.5" transform={`rotate(${a} 200 200)`} />)}
          {slots.map((a) => <line key={`s${a}`} x1="200" y1="114" x2="200" y2="126" strokeWidth="1.2" opacity="0.28" transform={`rotate(${a + 5} 200 200)`} />)}
          {bolts.map((a) => <circle key={a} cx={200 + 40 * Math.cos((a * Math.PI) / 180)} cy={200 + 40 * Math.sin((a * Math.PI) / 180)} r="6.5" strokeWidth="1.8" />)}
          <circle cx="200" cy="200" r="14" strokeWidth="1.8" />
        </g>
        {/* dimension lines, engineering-drawing style */}
        <g stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 4" fill="none">
          <line x1="200" y1="200" x2="384" y2="200" /><line x1="16" y1="200" x2="200" y2="200" opacity="0.5" />
        </g>
      </svg>

      <div className="absolute bottom-[3%] left-0 w-[72%] -rotate-[4deg] drop-shadow-[0_18px_30px_rgba(23,43,77,0.18)]">
        <PartLabel qr={qr} company={company} scan />
      </div>

      <div className="absolute left-[3%] top-[33%] flex items-center gap-2.5 rounded-full border border-success-line bg-white py-2 pl-2.5 pr-4 shadow-md">
        <span className="grid size-7 place-items-center rounded-full bg-success-soft text-success"><CheckCircle2 aria-hidden className="size-4" /></span>
        <span className="text-small font-semibold leading-tight text-ink">Code recognized<span className="block text-caption font-normal text-quiet">Registered with {company}</span></span>
      </div>

      <p aria-hidden className="absolute left-0 top-[2%] hidden font-mono text-[0.6875rem] tracking-[0.12em] text-quiet sm:block">FIG. 1 — LABEL ON PART</p>
    </div>
  );
}
