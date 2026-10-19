"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShieldCheck } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/verify", label: "Verify a part" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/faq", label: "FAQ" },
  { href: "/support", label: "Support" },
] as const;

export function SiteNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {LINKS.map((l) => {
        const active = l.href === path;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-md px-3 py-2 text-small font-medium text-body transition-colors hover:bg-subtle hover:text-ink", active && "text-ink")}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ company }: { company: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu"><Menu aria-hidden className="!size-5" /></Button>
      </SheetTrigger>
      <SheetContent side="right" title="Menu" description={`${company} navigation`}>
        <nav aria-label="Mobile" className="mt-14 grid gap-1 px-4">
          {LINKS.map((l) => (
            <SheetClose key={l.href} asChild>
              <Link href={l.href} className="rounded-lg px-3 py-3.5 text-[1.0625rem] font-medium text-ink transition-colors hover:bg-subtle">{l.label}</Link>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <SheetClose asChild>
            <Button asChild size="lg" className="w-full"><Link href="/verify"><ShieldCheck aria-hidden />Verify a part</Link></Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
