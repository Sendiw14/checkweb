import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FaqList } from "@/components/public/faq-list";
import { faqs } from "@/content/faq";
import { getSiteSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Questions and answers" };

export default async function FaqPage() {
  const s = await getSiteSettings();
  const items = faqs(s.companyName);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <div className="mx-auto grid w-full max-w-[var(--container-page)] gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="lg:sticky lg:top-28 lg:self-start">
        <p className="text-eyebrow">Questions and answers</p>
        <h1 className="text-title mt-4">How the check works, and what it can't tell you.</h1>
        <p className="text-lead mt-5">Plain answers about the codes, your privacy and what to do when something looks off.</p>
        <Button asChild className="mt-8"><Link href="/support#form">Still unsure? Contact support</Link></Button>
      </div>
      <FaqList items={items} />
    </div>
  );
}
