import Link from "next/link";
import { Wordmark } from "@/components/brand/brand-mark";
import { PartLabel } from "@/components/brand/part-label";
import { qrPath } from "@/server/qr";
import { getSiteSettings, siteUrl } from "@/server/settings";
import { productImageUrl } from "@/server/storage/images";

/** Two-panel frame for sign-in and password flows: calm form on the left, brand artwork on large screens. */
export async function AuthShell({ title, description, children, footer }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const s = await getSiteSettings();
  const qr = qrPath(`${siteUrl()}/verify`, "M");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="w-fit rounded-md" aria-label={`${s.companyName} home`}><Wordmark name={s.companyName} logoUrl={productImageUrl(s.logoPath)} /></Link>
        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center py-12 outline-none">
          <h1 className="text-title">{title}</h1>
          {description ? <p className="mt-3 text-body">{description}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 text-small text-quiet">{footer}</div> : null}
        </main>
        <p className="text-caption text-quiet">Staff area. Activity is logged. <Link href="/" className="underline underline-offset-4 hover:text-ink">Back to the public site</Link></p>
      </div>
      <aside aria-hidden className="relative hidden overflow-hidden border-l border-line bg-brand-soft lg:block">
        <div className="bg-grid bg-grid-fade absolute inset-0 opacity-70" />
        <div className="absolute inset-0 grid place-items-center p-16">
          <div className="w-full max-w-md -rotate-3">
            <PartLabel qr={qr} company={s.companyName} scan />
            <p className="mt-8 max-w-sm text-small text-body">Every part gets its own code. This workspace is where those codes are issued, printed, released and watched.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
