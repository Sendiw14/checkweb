"use client";
import Link from "next/link";
import { Bell, CircleCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AlertItem = { id: string; tone: "danger" | "warning" | "info"; title: string; detail: string; href: string };

export function AlertsMenu({ alerts }: { alerts: AlertItem[] }) {
  const tones = { danger: "bg-danger", warning: "bg-warning", info: "bg-brand" } as const;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={alerts.length ? `Alerts: ${alerts.length} need attention` : "Alerts: nothing needs attention"}>
          <Bell aria-hidden className="!size-[18px]" />
          {alerts.length ? <span aria-hidden className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.625rem] font-semibold leading-4 text-white">{alerts.length > 9 ? "9+" : alerts.length}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="border-b border-line px-4 py-3"><p className="text-subheading">Needs attention</p></div>
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center"><CircleCheck aria-hidden className="size-6 text-success" /><p className="text-small text-quiet">All clear: nothing is waiting on you.</p></div>
        ) : (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-cloud">
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", tones[a.tone])} />
                  <span className="min-w-0"><span className="block text-small font-semibold text-ink">{a.title}</span><span className="block text-caption text-quiet">{a.detail}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
