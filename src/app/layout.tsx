import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getSiteSettings } from "@/server/settings";
import { Providers } from "@/components/providers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    title: { default: `${s.companyName} — Part authenticity check`, template: `%s · ${s.companyName}` },
    description: `Check that a spare part is registered with ${s.companyName}. Scan the QR code on the part or enter its code. No app or account needed.`,
    applicationName: `${s.companyName} Verify`,
    robots: { index: true, follow: true },
    referrer: "strict-origin-when-cross-origin",
    formatDetection: { telephone: false, email: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers opts the tree into dynamic rendering, which is what lets
  // Next.js apply the per-request CSP nonce set in proxy.ts to its own scripts.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const settings = await getSiteSettings();
  return (
    <html lang="en" data-brand={settings.brandTheme} className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased" data-nonce={nonce ? "set" : undefined}>
        <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-[var(--z-toast)] rounded-md bg-ink px-3 py-2 text-small font-medium text-white">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
