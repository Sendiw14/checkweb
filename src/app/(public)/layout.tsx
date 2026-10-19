import { getSiteSettings } from "@/server/settings";
import { SiteFooter, SiteHeader } from "@/components/public/public-shell";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader settings={settings} />
      <main id="main" className="flex-1 outline-none" tabIndex={-1}>{children}</main>
      <SiteFooter settings={settings} />
    </div>
  );
}
