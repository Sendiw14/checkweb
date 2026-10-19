"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";

/** From/to dates (UTC days) kept in the URL like every other filter. */
export function DateRange({ fromParam = "from", toParam = "to" }: { fromParam?: string; toParam?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (key: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(key, v); else next.delete(key);
    next.delete("page");
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
  };
  return (
    <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto" role="group" aria-label="Date range (UTC)">
      <CalendarRange aria-hidden className="size-4 shrink-0 text-quiet" />
      <Input type="date" aria-label="From date" value={sp.get(fromParam) ?? ""} max={sp.get(toParam) ?? undefined} onChange={(e) => set(fromParam, e.target.value)} className="sm:w-40" />
      <span className="text-quiet" aria-hidden>→</span>
      <Input type="date" aria-label="To date" value={sp.get(toParam) ?? ""} min={sp.get(fromParam) ?? undefined} onChange={(e) => set(toParam, e.target.value)} className="sm:w-40" />
    </div>
  );
}
