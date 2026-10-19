import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withParams } from "@/lib/url-state";
import { formatNumber } from "@/lib/utils";

export function Pagination({ path, params, page, pageSize, total }: { path: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const href = (p: number) => withParams(path, { ...params, page: p > 1 ? p : undefined });
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-col items-center justify-between gap-3 text-small text-quiet sm:flex-row">
      <p aria-live="polite">{total === 0 ? "No results" : <>Showing <span className="tabular font-medium text-ink">{formatNumber(from)}–{formatNumber(to)}</span> of <span className="tabular font-medium text-ink">{formatNumber(total)}</span></>}</p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm" aria-disabled={page <= 1}><Link href={href(Math.max(1, page - 1))} aria-label="Previous page" tabIndex={page <= 1 ? -1 : 0}><ChevronLeft aria-hidden />Previous</Link></Button>
          <span className="tabular px-2">Page {page} of {formatNumber(pages)}</span>
          <Button asChild variant="secondary" size="sm" aria-disabled={page >= pages}><Link href={href(Math.min(pages, page + 1))} aria-label="Next page" tabIndex={page >= pages ? -1 : 0}>Next<ChevronRight aria-hidden /></Link></Button>
        </div>
      ) : null}
    </nav>
  );
}
