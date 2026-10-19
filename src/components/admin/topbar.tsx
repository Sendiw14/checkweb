import { AlertsMenu, type AlertItem } from "@/components/admin/alerts-menu";
import { GlobalSearch } from "@/components/admin/global-search";
import { MobileSidebar } from "@/components/admin/sidebar";
import { UserMenu } from "@/components/admin/user-menu";
import type { Permission } from "@/server/auth/permissions";

export type { AlertItem };
export const AdminAlerts = AlertsMenu;

export function AdminTopbar({ company, logoUrl, allowed, user, alerts }: {
  company: string; logoUrl: string | null; allowed: Permission[]; user: { name: string; email: string; roleLabel: string }; alerts: AlertItem[];
}) {
  return (
    <div className="sticky top-0 z-[var(--z-sticky)] flex h-16 items-center gap-2 border-b border-line bg-white/90 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 sm:gap-3 sm:px-6 lg:px-10">
      <MobileSidebar company={company} logoUrl={logoUrl} allowed={allowed} />
      <div className="ml-1 lg:ml-0"><GlobalSearch /></div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <AlertsMenu alerts={alerts} />
        <UserMenu {...user} />
      </div>
    </div>
  );
}
