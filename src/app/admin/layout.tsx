import type { Metadata } from "next";
import { AdminTopbar } from "@/components/admin/topbar";
import { DesktopSidebar } from "@/components/admin/sidebar";
import { PERMISSIONS, ROLE_LABELS, can } from "@/server/auth/permissions";
import { requireStaff } from "@/server/auth/guards";
import { getAlerts } from "@/server/repos/alerts";
import { getSiteSettings } from "@/server/settings";
import { productImageUrl } from "@/server/storage/images";

export const metadata: Metadata = { title: { default: "Staff workspace", template: "%s · Staff" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // allowMfaPending lets the security page itself render for people who still have to enrol.
  const staff = await requireStaff({ next: "/admin/dashboard", allowMfaPending: true });
  // While the second factor is still owed, show chrome only: no navigation and no operational counts.
  const pending = staff.mfaRequired;
  const [settings, alerts] = await Promise.all([getSiteSettings(), pending ? Promise.resolve([]) : getAlerts(staff)]);
  const allowed = pending ? [] : PERMISSIONS.filter((p) => can(staff.role, p));
  const logo = productImageUrl(settings.logoPath);
  return (
    <div className="min-h-dvh bg-cloud">
      <DesktopSidebar company={settings.companyName} logoUrl={logo} allowed={allowed} />
      <div className="lg:pl-[15.5rem]">
        <AdminTopbar company={settings.companyName} logoUrl={logo} allowed={allowed} user={{ name: staff.displayName, email: staff.email, roleLabel: ROLE_LABELS[staff.role] }} alerts={alerts} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[88rem] px-4 pb-16 pt-6 outline-none sm:px-6 sm:pt-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
