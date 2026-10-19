import * as React from "react";

export function LegalPage({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[var(--container-prose)] px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-eyebrow">{eyebrow}</p>
      <h1 className="text-title mt-4">{title}</h1>
      <p className="mt-3 text-small text-quiet">Version 1 · Last updated {updated}</p>
      <div className="mt-10 space-y-8 text-body [&_h2]:text-heading [&_h2]:mb-3 [&_h3]:text-subheading [&_li]:mt-1.5 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-4 [&_p+p]:mt-3">{children}</div>
    </div>
  );
}
