import type { LucideIcon } from "lucide-react";
import { Activity, Boxes, ClipboardList, FileBarChart, History, LayoutDashboard, LifeBuoy, Megaphone, Package, QrCode, Search, Settings, ShieldAlert, Users } from "lucide-react";
import type { Permission } from "@/server/auth/permissions";

export type NavItem = { href: string; label: string; icon: LucideIcon; permission: Permission; match?: "exact" | "prefix" };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: "Overview", items: [{ href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" }] },
  {
    label: "Inventory",
    items: [
      { href: "/admin/products", label: "Products", icon: Package, permission: "products.read" },
      { href: "/admin/batches", label: "Batches", icon: Boxes, permission: "batches.read" },
      { href: "/admin/part-units", label: "Part units", icon: Search, permission: "units.read" },
      { href: "/admin/labels", label: "QR labels", icon: QrCode, permission: "labels.read" },
    ],
  },
  {
    label: "Protection",
    items: [
      { href: "/admin/scans", label: "Scan activity", icon: Activity, permission: "scans.read" },
      { href: "/admin/investigations", label: "Investigations", icon: ShieldAlert, permission: "investigations.read" },
      { href: "/admin/recalls", label: "Recalls", icon: Megaphone, permission: "recalls.read" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/support", label: "Support cases", icon: LifeBuoy, permission: "support.read" },
      { href: "/admin/reports", label: "Reports", icon: FileBarChart, permission: "reports.read" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/team", label: "Team", icon: Users, permission: "team.read" },
      { href: "/admin/audit", label: "Audit log", icon: History, permission: "audit.read" },
      { href: "/admin/settings", label: "Settings", icon: Settings, permission: "settings.read" },
    ],
  },
];

export const ICON_FALLBACK = ClipboardList;
