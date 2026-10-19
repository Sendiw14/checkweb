import { cn } from "@/lib/utils";

/**
 * Placeholder mark: a shield (assurance) with a check, split into two tones like an
 * enamel badge. Replace by setting a logo in Settings; nothing else depends on it.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className={cn("size-8 shrink-0", className)} fill="none">
      <path d="M16 2.5 4.5 6.6v8.6c0 6.7 4.7 11.9 11.5 14.3V2.5Z" fill="var(--brand)" />
      <path d="M16 2.5 27.5 6.6v8.6c0 6.7-4.7 11.9-11.5 14.3V2.5Z" fill="var(--brand-deep)" />
      <path d="m10.4 15.8 4 4 7.4-8.1" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="8.1" r="1.15" fill="var(--teal-soft)" />
    </svg>
  );
}

export function Wordmark({ name, className, logoUrl }: { name: string; className?: string; logoUrl?: string | null }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-provided logo, fixed height, tiny
        <img src={logoUrl} alt="" className="h-8 w-auto max-w-40 object-contain" height={32} />
      ) : (
        <BrandMark />
      )}
      <span className="text-[1.0625rem] font-semibold leading-none tracking-[-0.02em] text-ink">{name}</span>
    </span>
  );
}
