"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Package, Search, Boxes, LifeBuoy, ShieldAlert, Barcode, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Hit = { type: "product" | "batch" | "unit" | "support" | "investigation"; id: string; title: string; subtitle: string; href: string };
const ICONS = { product: Package, batch: Boxes, unit: Barcode, support: LifeBuoy, investigation: ShieldAlert } as const;
const LABEL = { product: "Product", batch: "Batch", unit: "Part unit", support: "Support case", investigation: "Investigation" } as const;

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Hit[]>([]);
  const [state, setState] = React.useState<"idle" | "loading" | "error">("idle");
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "") && !(e.target as HTMLElement)?.isContentEditable) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) { setQ(""); setHits([]); setState("idle"); }
  };

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal, cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const body = (await res.json()) as { hits: Hit[] };
        setHits(body.hits); setActive(0); setState("idle");
      } catch (e) { if ((e as Error).name !== "AbortError") setState("error"); }
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const go = (h: Hit) => { setOpen(false); router.push(h.href); };

  return (
    <>
      <Button variant="secondary" size="md" className="h-9 w-9 justify-center gap-2 px-0 text-quiet sm:w-64 sm:justify-start sm:px-3 sm:font-normal" onClick={() => setOpen(true)} aria-label="Search serials, SKUs, batches… (press slash or Command K)">
        <Search aria-hidden />
        <span className="hidden sm:inline">Search serials, SKUs, batches…</span>
        <kbd aria-hidden data-key="/" className="ml-auto hidden rounded border border-line bg-cloud px-1.5 font-mono text-[0.6875rem] text-quiet after:content-[attr(data-key)] sm:inline" />
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent title="Search" description="Find a serial number, SKU, batch code or case reference." className="top-[18%] translate-y-0 gap-0 p-0 sm:max-w-xl [&>div:first-child]:sr-only">
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search aria-hidden className="size-4 shrink-0 text-quiet" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search serials, SKUs, batches, cases…" aria-label="Search query" role="combobox" aria-expanded={hits.length > 0} aria-controls="search-results" aria-activedescendant={hits[active] ? `hit-${active}` : undefined}
              className="h-14 flex-1 bg-transparent text-[1rem] text-ink outline-none placeholder:text-quiet"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active]!); }
              }}
            />
            {state === "loading" ? <Spinner label="Searching" /> : null}
          </div>
          <div className="max-h-80 overflow-y-auto p-2" id="search-results" role="listbox" aria-label="Results">
            {state === "error" ? <p className="px-3 py-8 text-center text-small text-danger" role="alert">Search failed. Check your connection and try again.</p> : null}
            {state !== "error" && q.trim().length >= 2 && state === "idle" && hits.length === 0 ? <p className="px-3 py-8 text-center text-small text-quiet">No matches for “{q.trim()}”.</p> : null}
            {q.trim().length < 2 ? <p className="px-3 py-8 text-center text-small text-quiet">Type at least two characters. Try a serial like <span className="font-mono text-ink">AXM-0000</span> or a SKU.</p> : null}
            {hits.map((h, i) => {
              const Icon = ICONS[h.type];
              return (
                <button key={`${h.type}-${h.id}`} id={`hit-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", i === active && "bg-brand-soft")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-white text-quiet"><Icon aria-hidden className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-small font-semibold text-ink">{h.title}</span><span className="block truncate text-caption text-quiet">{LABEL[h.type]} · {h.subtitle}</span></span>
                  {i === active ? <CornerDownLeft aria-hidden className="size-4 text-quiet" /> : null}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
