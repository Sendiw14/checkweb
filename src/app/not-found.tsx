import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ScanLine } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { getSiteSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: false } };

/** Used for any URL that matches nothing. Same chrome as the public site, so a typo never lands on a bare default page. */
export default async function NotFound() {
  const settings = await getSiteSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader settings={settings} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <div className="mx-auto grid w-full max-w-[var(--container-page)] place-items-center px-4 py-20 sm:px-6 sm:py-28">
          <div className="max-w-xl text-center">
            <p className="text-eyebrow text-brand">Error 404</p>
            <h1 className="text-display mt-3">We can't find that page</h1>
            <p className="text-lead mt-4 text-body">The address may have a typo, or the page may have moved. If you were checking a part, scan its QR code again or type the code printed beneath it.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg"><Link href="/verify"><ScanLine aria-hidden />Check a part</Link></Button>
              <Button asChild size="lg" variant="secondary"><Link href="/">Go to the home page<ArrowRight aria-hidden /></Link></Button>
            </div>
            <p className="mt-6 text-small text-quiet">Need a hand? <Link href="/support" className="font-medium text-brand underline-offset-4 hover:underline">Contact support</Link>.</p>
          </div>
        </div>
      </main>
      <SiteFooter settings={settings} />
    </div>
  );
}
