"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FilterDef = { param: string; label: string; options: { value: string; label: string }[] };

const ALL = "__all";

/**
 * Search + filters for any list. State lives in the URL (shareable, back-button friendly,
 * server-rendered), and every change resets to page 1.
 */
export function ListToolbar({ placeholder = "Search…", filters = [], searchParam = "q", showSearchless = false, children }: { placeholder?: string; filters?: FilterDef[]; searchParam?: string; /** Hide the text box (filters only). */ showSearchless?: boolean; children?: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const urlQ = sp.get(searchParam) ?? "";
  const [q, setQ] = React.useState(urlQ);
  const [pending, startTransition] = React.useTransition();

  // Keep the box in step with back/forward navigation.
  const lastUrlQ = React.useRef(urlQ);
  React.useEffect(() => {
    if (urlQ !== lastUrlQ.current) { lastUrlQ.current = urlQ; setQ(urlQ); }
  }, [urlQ]);

  const push = React.useCallback((next: URLSearchParams) => {
    next.delete("page");
    startTransition(() => router.replace(next.size ? `${path}?${next}` : path, { scroll: false }));
  }, [path, router]);

  React.useEffect(() => {
    if (q === urlQ) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (q.trim()) next.set(searchParam, q.trim()); else next.delete(searchParam);
      lastUrlQ.current = q.trim();
      push(next);
    }, 300);
    return () => clearTimeout(t);
  }, [q, urlQ, sp, searchParam, push]);

  const active = filters.filter((f) => sp.get(f.param)).length + (urlQ ? 1 : 0);

  return (
    <div className="app-list-toolbar flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" role="search" aria-busy={pending}>
      {showSearchless ? null : <div className="app-list-search relative min-w-0 sm:w-72">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-quiet" />
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="app-list-search-control h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-[0.9375rem] text-ink placeholder:text-quiet hover:border-ink/60 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25 pointer-coarse:h-11"
        />
      </div>}
      {filters.map((f) => (
        <div key={f.param} className="app-list-filter sm:w-48">
          <Select value={sp.get(f.param) ?? ALL} onValueChange={(v) => { const next = new URLSearchParams(sp.toString()); if (v === ALL) next.delete(f.param); else next.set(f.param, v); push(next); }}>
            <SelectTrigger aria-label={f.label}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{f.label}: all</SelectItem>
              {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
      {children}
      {active > 0 ? (
        <Button variant="ghost" size="md" onClick={() => { setQ(""); startTransition(() => router.replace(path, { scroll: false })); }}><X aria-hidden />Clear{active > 1 ? ` ${active} filters` : ""}</Button>
      ) : null}
    </div>
  );
}
