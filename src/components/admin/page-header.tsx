import Link from "next/link";
import { ChevronRight } from "lucide-react";
import * as React from "react";

export type Crumb = { label: string; href?: string };

export function PageHeader({ title, description, actions, crumbs, meta }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; crumbs?: Crumb[]; meta?: React.ReactNode }) {
  return (
    <header className="app-page-header mb-7 sm:mb-9">
      {crumbs?.length ? (
        <nav aria-label="Breadcrumb" className="app-breadcrumbs mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-small text-quiet">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {c.href && i < crumbs.length - 1 ? <Link href={c.href} className="rounded px-0.5 hover:text-ink hover:underline">{c.label}</Link> : <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className={i === crumbs.length - 1 ? "text-body" : undefined}>{c.label}</span>}
                {i < crumbs.length - 1 ? <ChevronRight aria-hidden className="size-3.5" /> : null}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="app-page-title text-title break-words">{title}</h1>
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
          {description ? <p className="app-page-description mt-2 max-w-2xl text-body">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
