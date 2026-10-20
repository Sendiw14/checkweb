import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardCheck, Globe, Hash, ScanLine, ShieldCheck, ShieldQuestion, Smartphone, Truck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroVisual } from "@/components/brand/hero-visual";
import { PartLabel } from "@/components/brand/part-label";
import { HeroCodeEntry } from "@/components/public/hero-code-entry";
import { Reveal, RevealItem, RevealList } from "@/components/public/reveal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FAQ_HIGHLIGHTS } from "@/content/faq";
import { getSiteSettings, siteUrl } from "@/server/settings";
import { qrPath } from "@/server/qr";

export default async function LandingPage() {
  const s = await getSiteSettings();
  const verifyUrl = `${siteUrl()}/verify`;
  const host = new URL(verifyUrl).host;
  const qr = qrPath(verifyUrl, "M");

  return (
    <>
      {/* ------------------------------ HERO ------------------------------ */}
      <section className="landing-hero relative isolate overflow-hidden border-b border-line">
        <div aria-hidden className="landing-hero-grid bg-grid bg-grid-fade absolute inset-0 -z-10 opacity-35" />
        <div className="landing-hero-layout mx-auto grid grid-cols-[minmax(0,1fr)] w-full max-w-[var(--container-page)] items-center gap-10 px-4 pb-14 pt-10 sm:gap-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:pb-24 lg:pt-20">
          <div>
            <p className="hero-kicker text-eyebrow"><span aria-hidden className="hero-kicker-dot" />Part authenticity, made clear</p>
            <h1 className="hero-headline text-display mt-5 max-w-[13ch]">Know the part in your hands is registered.</h1>
            <p className="hero-intro text-lead mt-6">
              Every {s.companyName} part carries its own code. Scan it with your phone's camera and we'll check it against our records, in plain language. No app, no account.
            </p>
            <div className="hero-actions mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg"><Link href="/verify"><ScanLine aria-hidden />Scan or enter a code</Link></Button>
              <Button asChild size="lg" variant="secondary"><Link href="#how-it-works">How it works<ArrowRight aria-hidden /></Link></Button>
            </div>
            <div className="hero-code-panel mt-9 max-w-md rounded-xl border border-line bg-white p-5 sm:mt-10 sm:p-6">
              <HeroCodeEntry />
            </div>
          </div>
          <HeroVisual qr={qr} company={s.companyName} />
        </div>
      </section>

      {/* ------------------------- HOW IT WORKS --------------------------- */}
      <section id="how-it-works" className="editorial-section scroll-mt-20 py-20 sm:py-28">
        <div className="mx-auto w-full max-w-[var(--container-page)] px-4 sm:px-6">
          <Reveal className="max-w-2xl">
            <p className="text-eyebrow">How it works</p>
            <h2 className="text-title mt-4">Three steps, about ten seconds.</h2>
          </Reveal>
          <RevealList as="ol" className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
            {[
              { n: "01", icon: Smartphone, title: "Scan the QR code", body: "Open your phone's camera and point it at the QR code on the part's label. On iPhone and Android a link appears automatically." },
              { n: "02", icon: Globe, title: "Open the official website", body: `Tap the link. It opens this website in your browser. Check that the address bar says ${host}.` },
              { n: "03", icon: ShieldCheck, title: "See the result", body: `We look the code up in ${s.companyName}'s records and tell you exactly what we found, and what to do if something looks off.` },
            ].map((step, i) => (
              <RevealItem as="li" key={step.n} index={i} className="relative bg-white p-7 sm:p-8">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-small tracking-[0.1em] text-quiet">{step.n}</span>
                  <span className="grid size-11 place-items-center rounded-lg border border-line bg-cloud text-brand"><step.icon aria-hidden className="size-5" strokeWidth={1.7} /></span>
                </div>
                <h3 className="text-heading mt-10">{step.title}</h3>
                <p className="mt-3 text-body">{step.body}</p>
              </RevealItem>
            ))}
          </RevealList>
        </div>
      </section>

      {/* ----------------------- WHAT THE CHECK TELLS YOU ------------------ */}
      <section className="trust-section border-y border-line bg-cloud py-20 sm:py-28">
        <div className="mx-auto grid grid-cols-[minmax(0,1fr)] w-full max-w-[var(--container-page)] gap-14 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <Reveal>
            <p className="text-eyebrow">What we check</p>
            <h2 className="text-title mt-4">An honest answer, not a rubber stamp.</h2>
            <p className="text-lead mt-5">
              Each physical part gets its own secret code, issued by {s.companyName} and stored only as a one-way fingerprint. When you scan it, we check what our records say about that exact unit.
            </p>
            <div className="mt-8 max-w-[22rem] rotate-[-2deg] transition-transform duration-[var(--dur-base)] hover:rotate-0">
              <PartLabel qr={qr} company={s.companyName} />
            </div>
            <ol className="mt-6 grid max-w-[22rem] gap-2 text-small text-quiet" aria-label="Parts of a label">
              <li><span className="font-mono text-ink">QR code</span>: opens this website with the code inside.</li>
              <li><span className="font-mono text-ink">Serial</span>: identifies this one part.</li>
              <li><span className="font-mono text-ink">Backup code</span>: type it in if the QR code is damaged.</li>
            </ol>
          </Reveal>

          <div className="grid content-start gap-4">
            <RevealList className="grid gap-4">
              {[
                { icon: Hash, title: "It's a real code from us", body: "The code matches a record that only the manufacturer can create. Guessing one is not practical." },
                { icon: ClipboardCheck, title: "It was released for sale", body: "The unit passed quality control and left production. Parts still in production or on hold say so." },
                { icon: BadgeCheck, title: "It hasn't been withdrawn", body: "We tell you if a code was replaced, if the part is on hold, or if a recall applies and what to do about it." },
                { icon: Truck, title: "We show earlier checks, without blame", body: "If a code was checked before, we show when. That's normal for retailers and workshops. Unusual patterns are looked at by a person, never assumed to be your fault." },
              ].map((r, i) => (
                <RevealItem key={r.title} index={i} className="flex gap-4 rounded-xl border border-line bg-white p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><r.icon aria-hidden className="size-5" strokeWidth={1.7} /></span>
                  <div><h3 className="text-subheading">{r.title}</h3><p className="mt-1 text-small text-body">{r.body}</p></div>
                </RevealItem>
              ))}
            </RevealList>
            <Reveal>
              <div className="flex gap-4 rounded-xl border border-warning-line bg-warning-soft p-5">
                <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
                <div>
                  <h3 className="text-subheading">What a recognized code does not prove</h3>
                  <p className="mt-1 text-small text-body">
                    A code shows the record exists. It can't see the part in your hand, and a label can be copied onto something else. If the part, its packaging or the label looks wrong, trust your eyes and contact us.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------------- IF SOMETHING LOOKS WRONG ------------------- */}
      <section className="support-section py-20 sm:py-28">
        <div className="mx-auto w-full max-w-[var(--container-page)] px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-[#c7d9f8] bg-brand-soft px-6 py-12 sm:px-12 sm:py-16">
              <div aria-hidden className="bg-grid bg-grid-fade absolute inset-0 opacity-60" />
              <div className="relative grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
                <div>
                  <ShieldQuestion aria-hidden className="size-8 text-brand" strokeWidth={1.6} />
                  <h2 className="text-title mt-5">If something doesn't look right</h2>
                  <p className="text-lead mt-4">
                    An error, a code we can't find, a recall notice or a label that looks different from what you expected: tell us. Keep the part and its packaging; we may ask for photos.
                  </p>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button asChild size="lg"><Link href="/support#form">Contact support</Link></Button>
                    <Button asChild size="lg" variant="secondary"><Link href="/faq">Read the questions and answers</Link></Button>
                  </div>
                </div>
                <ol className="grid gap-3 text-small text-body">
                  {["Note the serial number printed on the label.", "Keep the part and its packaging as they are.", "Tell us where and when you got it."].map((t, i) => (
                    <li key={t} className="flex items-center gap-4 rounded-xl bg-white/80 px-4 py-3.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-caption font-semibold text-white">{i + 1}</span>{t}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------ FAQ -------------------------------- */}
      <section className="pb-4">
        <div className="mx-auto grid grid-cols-[minmax(0,1fr)] w-full max-w-[var(--container-page)] gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-eyebrow">Questions</p>
            <h2 className="text-title mt-4">Quick answers</h2>
            <Button asChild variant="link" className="mt-5 text-small"><Link href="/faq">See all questions<ArrowRight aria-hidden /></Link></Button>
          </div>
          <Accordion type="single" collapsible>
            {FAQ_HIGHLIGHTS(s.companyName).map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  );
}
