import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { SiteNav, MobileNav } from "@/components/public/site-nav";
import type { SiteSettings } from "@/server/settings";
import { productImageUrl } from "@/server/storage/images";

export function SiteHeader({ settings }: { settings: SiteSettings }) {
  const logo = productImageUrl(settings.logoPath);
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-line bg-white/90 pt-[var(--safe-top)] backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 w-full max-w-[var(--container-page)] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label={`${settings.companyName} home`} className="rounded-md">
          <Wordmark name={settings.companyName} logoUrl={logo} />
        </Link>
        <SiteNav />
        <div className="flex items-center gap-2">
          <Button asChild size="md" className="hidden sm:inline-flex">
            <Link href="/verify"><ShieldCheck aria-hidden />Verify a part</Link>
          </Button>
          <MobileNav company={settings.companyName} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ settings }: { settings: SiteSettings }) {
  const year = new Date().getUTCFullYear();
  const legal = settings.legalName ?? settings.companyName;
  return (
    <footer className="mt-16 border-t border-line bg-cloud pb-[max(1.5rem,var(--safe-bottom))]">
      <div className="mx-auto grid w-full max-w-[var(--container-page)] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm space-y-4">
          <Wordmark name={settings.companyName} logoUrl={productImageUrl(settings.logoPath)} />
          <p className="text-small text-quiet">
            Check whether a spare part's code matches a record issued by {settings.companyName}. A recognized code supports, but does not by itself prove, that a part is genuine.
          </p>
        </div>
        <nav aria-label="Footer" className="grid content-start gap-2.5 text-small">
          <p className="text-label mb-1">Explore</p>
          <Link className="text-body hover:text-brand" href="/verify">Verify a part</Link>
          <Link className="text-body hover:text-brand" href="/#how-it-works">How it works</Link>
          <Link className="text-body hover:text-brand" href="/faq">Questions and answers</Link>
          <Link className="text-body hover:text-brand" href="/support">Contact support</Link>
        </nav>
        <nav aria-label="Legal" className="grid content-start gap-2.5 text-small">
          <p className="text-label mb-1">Legal</p>
          <Link className="text-body hover:text-brand" href={settings.privacyUrl ?? "/privacy"}>Privacy notice</Link>
          <Link className="text-body hover:text-brand" href={settings.termsUrl ?? "/terms"}>Terms of use</Link>
          <Link className="text-body hover:text-brand" href="/login">Staff sign in</Link>
        </nav>
      </div>
      <div className="mx-auto flex w-full max-w-[var(--container-page)] flex-col gap-1 border-t border-line px-4 py-5 text-caption text-quiet sm:flex-row sm:justify-between sm:px-6">
        <p>© {year} {legal}</p>
        {settings.supportEmail ? <p>Support: <a className="text-body hover:text-brand" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></p> : null}
      </div>
    </footer>
  );
}
