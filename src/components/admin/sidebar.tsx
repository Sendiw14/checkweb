"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Wordmark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV } from "@/components/admin/nav-config";
import type { Permission } from "@/server/auth/permissions";

function NavList({ allowed, onNavigate }: { allowed: Permission[]; onNavigate?: () => void }) {
  const path = usePathname();
  const set = new Set(allowed);
  return (
    <nav aria-label="Admin" className="grid gap-6">
      {NAV.map((g) => {
        const items = g.items.filter((i) => set.has(i.permission));
        if (!items.length) return null;
        return (
          <div key={g.label}>
            <p className="px-3 text-caption font-semibold uppercase tracking-[0.1em] text-quiet">{g.label}</p>
            <ul className="mt-2 grid gap-0.5">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + "/");
                const Link_ = (
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-small font-medium text-body transition-colors hover:bg-subtle hover:text-ink pointer-coarse:py-3",
                      active && "bg-brand-soft text-ink hover:bg-brand-soft",
                    )}
                  >
                    {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" /> : null}
                    <i.icon aria-hidden className={cn("size-[18px] shrink-0", active ? "text-brand" : "text-quiet group-hover:text-body")} strokeWidth={1.8} />
                    {i.label}
                  </Link>
                );
                return <li key={i.href}>{Link_}</li>;
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function DesktopSidebar({ company, logoUrl, allowed }: { company: string; logoUrl: string | null; allowed: Permission[] }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-[var(--z-sticky)] hidden w-[15.5rem] flex-col border-r border-line bg-white lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
        <Link href="/admin/dashboard" aria-label="Dashboard" className="rounded-md"><Wordmark name={company} logoUrl={logoUrl} /></Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5"><NavList allowed={allowed} /></div>
      <p className="border-t border-line px-5 py-3 text-caption text-quiet">Staff workspace</p>
    </aside>
  );
}

export function MobileSidebar({ company, logoUrl, allowed }: { company: string; logoUrl: string | null; allowed: Permission[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"><Menu aria-hidden className="!size-5" /></Button></SheetTrigger>
      <SheetContent side="left" title="Navigation" description={`${company} staff navigation`}>
        <div className="flex h-16 shrink-0 items-center border-b border-line px-5"><Wordmark name={company} logoUrl={logoUrl} /></div>
        <div className="flex-1 overflow-y-auto px-3 py-5"><SheetClose asChild><div><NavList allowed={allowed} onNavigate={() => setOpen(false)} /></div></SheetClose></div>
      </SheetContent>
    </Sheet>
  );
}
