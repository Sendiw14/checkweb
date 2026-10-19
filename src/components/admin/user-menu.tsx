"use client";
import Link from "next/link";
import { ChevronsUpDown, ExternalLink, LogOut, ShieldCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(auth)/actions";
import { initials } from "@/lib/utils";

export function UserMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg border border-transparent py-1 pl-1 pr-2 text-left transition-colors hover:border-line hover:bg-cloud focus-visible:outline-2 focus-visible:outline-brand" aria-label={`Account menu, ${name}`}>
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-ink text-caption font-semibold text-white">{initials(name)}</span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-36 truncate text-small font-semibold leading-tight text-ink">{name}</span>
          <span className="block text-caption leading-tight text-quiet">{roleLabel}</span>
        </span>
        <ChevronsUpDown aria-hidden className="hidden size-4 text-quiet sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel className="space-y-0.5"><span className="block text-small font-semibold text-ink">{name}</span><span className="block break-all font-normal">{email}</span></DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/admin/security"><ShieldCheck aria-hidden />Account security</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/" target="_blank" rel="noreferrer"><ExternalLink aria-hidden />View public site</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild><button type="submit" className="w-full"><LogOut aria-hidden />Sign out</button></DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
