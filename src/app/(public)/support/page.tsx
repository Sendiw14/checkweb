import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { getSiteSettings } from "@/server/settings";
import { SupportForm } from "@/components/public/support-form";

export const metadata: Metadata = { title: "Contact support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ kind?: string; serial?: string; ref?: string }> }) {
  const [s, sp] = await Promise.all([getSiteSettings(), searchParams]);
  return (
    <div className="mx-auto grid grid-cols-[minmax(0,1fr)] w-full max-w-[var(--container-page)] gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
      <div>
        <p className="text-eyebrow">Support</p>
        <h1 className="text-title mt-4">Tell us what you found.</h1>
        <p className="text-lead mt-5">
          Whether it's a question about the check, a code we couldn't match, or a part you're unsure about, a person at {s.companyName} will read your message.
        </p>
        <ul className="mt-8 grid gap-3 text-small">
          {s.supportEmail ? <li className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand"><Mail aria-hidden className="size-4" /></span><a className="font-medium text-ink hover:text-brand" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a></li> : null}
          {s.supportPhone ? <li className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand"><Phone aria-hidden className="size-4" /></span><a className="font-medium text-ink hover:text-brand" href={`tel:${s.supportPhone.replace(/[^+\d]/g, "")}`}>{s.supportPhone}</a></li> : null}
          {!s.supportEmail && !s.supportPhone ? <li className="text-quiet">Use the form to reach us.</li> : null}
        </ul>
        <div className="mt-8 rounded-xl border border-line bg-cloud p-5 text-small text-body">
          <p className="font-semibold text-ink">Helpful to include</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The serial number printed on the label</li>
            <li>Where and when you got the part</li>
            <li>What the check told you, and the reference shown on the result</li>
          </ul>
          <p className="mt-3 text-quiet">Please don't send the secret code itself.</p>
        </div>
      </div>
      <div id="form" className="scroll-mt-24">
        <SupportForm defaults={{ kind: sp.kind, serial: sp.serial?.slice(0, 60), ref: sp.ref?.slice(0, 16) }} />
      </div>
    </div>
  );
}
