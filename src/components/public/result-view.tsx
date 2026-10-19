"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Mail, Phone, RefreshCw, ScanLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusSeal, toneStyles } from "@/components/brand/status-seal";
import { CopyButton } from "@/components/public/copy-button";
import { ProductImage } from "@/components/public/product-image";
import { copyFor, type StatusCopy } from "@/lib/verification-copy";
import { shortRequestRef, type PublicVerification } from "@/lib/verification-types";
import { cn, formatDate } from "@/lib/utils";

export type PublicContact = { company: string; supportEmail: string | null; supportPhone: string | null };

function supportHref(v: PublicVerification, kind: "concern" | "question" | "suspected_counterfeit" | "recall_enquiry") {
  const q = new URLSearchParams({ kind, ref: shortRequestRef(v.requestId) });
  if (v.reference) q.set("serial", v.reference);
  return `/support?${q.toString()}#form`;
}

/**
 * Renders any verification outcome. Layout: a tinted status panel (seal + verdict in plain
 * words) beside a registration-marked data plate for the part; on phones they stack with
 * the verdict first. Focus moves to the heading when the result appears.
 */
export function ResultView({
  data, contact, onRetry, onAnother, copyOverride, busy = false,
}: {
  data: PublicVerification; contact: PublicContact; onRetry?: () => void; onAnother?: () => void; copyOverride?: StatusCopy; busy?: boolean;
}) {
  const copy = copyOverride ?? copyFor(data, contact.company);
  const tone = toneStyles[copy.tone];
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { headingRef.current?.focus({ preventScroll: false }); }, [data.status]);

  const hasProduct = !!data.product;
  const isVerdict = ["recognized_first", "recognized_repeat", "suspicious", "recalled", "quarantined", "not_released", "retired"].includes(data.status);

  return (
    <section aria-labelledby="result-heading" className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-8" data-status={data.status}>
      {/* ---------- verdict ---------- */}
      <div className={cn("relative overflow-hidden rounded-2xl border p-5 sm:p-7", tone.line, tone.soft)}>
        <div aria-hidden className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <p className={cn("flex items-center justify-between gap-3 text-eyebrow", tone.text)} style={{ color: undefined }}>
            <span>Verification result</span>
            <span className="text-serial normal-case tracking-normal text-quiet" aria-label={`Reference ${shortRequestRef(data.requestId)}`}>
              REF {shortRequestRef(data.requestId)}
            </span>
          </p>
          <div className="mt-5 flex items-start gap-4">
            <StatusSeal tone={copy.tone} icon={copy.icon} size={72} />
            <div className="min-w-0 flex-1 pt-1">
              <h1 id="result-heading" ref={headingRef} tabIndex={-1} className="text-title outline-none">{copy.heading}</h1>
              {copy.chip ? <Badge tone="neutral" className="mt-2 bg-white/80">{copy.chip}</Badge> : null}
            </div>
          </div>
          <p className="mt-4 text-lead !max-w-none">{copy.lead}</p>
          {copy.next ? <p className="mt-3 text-small text-body">{copy.next}</p> : null}
        </div>
      </div>

      {/* ---------- part + actions ---------- */}
      <div className="grid gap-5">
        {data.status === "recalled" && data.recall ? (
          <article className="rounded-xl border border-danger-line border-l-4 border-l-danger bg-white p-5" aria-label="Recall instructions">
            <p className="text-eyebrow !text-danger">Recall {data.recall.reference}</p>
            <h2 className="mt-2 text-subheading">{data.recall.title}</h2>
            <p className="mt-1 text-caption text-quiet">Instructions from {contact.company}{data.recall.issuedAt ? `, issued ${formatDate(data.recall.issuedAt)}` : ""}</p>
            <p className="mt-3 whitespace-pre-line text-body">{data.recall.instructions}</p>
          </article>
        ) : null}

        {hasProduct ? (
          <div className="crop-marks border border-line bg-white" aria-label="Part details" role="group">
            <ProductImage src={data.product?.imageUrl} alt={`Photo of ${data.product?.name}`} className="aspect-[16/9] border-b border-line" />
            <div className="px-4 pb-1 pt-4 sm:px-5">
              {data.product?.brand || data.product?.category ? (
                <p className="text-caption text-quiet">{[data.product?.brand, data.product?.category].filter(Boolean).join(" · ")}</p>
              ) : null}
              <h2 className="text-subheading">{data.product?.name}</h2>
            </div>
            <dl className="mt-2 divide-y divide-line border-t border-line text-small">
              <Fact label="Part number" value={data.product?.partNumber} mono />
              {data.reference ? <Fact label="Serial number" value={data.reference} mono copy /> : null}
              {data.firstVerifiedAt ? <Fact label="First checked" value={formatDate(data.firstVerifiedAt)} /> : null}
              {typeof data.previousScanCount === "number" && data.previousScanCount > 0 ? <Fact label="Checked before" value={`${data.previousScanCount} time${data.previousScanCount === 1 ? "" : "s"}`} /> : null}
            </dl>
            <span className="crop-b" aria-hidden />
          </div>
        ) : null}

        <Actions data={data} copy={copy} contact={contact} onRetry={onRetry} onAnother={onAnother} busy={busy} isVerdict={isVerdict} />

        {isVerdict ? (
          <p className="text-caption text-quiet">
            What does this check? <Link href="/faq#what-is-checked" className="font-medium text-brand underline-offset-4 hover:underline">How codes are checked</Link>
            . We don't keep this code in your browser.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Fact({ label, value, mono, copy }: { label: string; value?: string | null; mono?: boolean; copy?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
      <dt className="shrink-0 text-quiet">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right font-medium text-ink">
        <span className={cn("min-w-0", mono && "text-serial")}>{value}</span>
        {copy ? <CopyButton value={value} label={label} /> : null}
      </dd>
    </div>
  );
}

function Actions({ data, copy, contact, onRetry, onAnother, busy, isVerdict }: {
  data: PublicVerification; copy: StatusCopy; contact: PublicContact; onRetry?: () => void; onAnother?: () => void; busy: boolean; isVerdict: boolean;
}) {
  const kind = data.status === "recalled" ? "recall_enquiry" : data.status === "suspicious" || data.status === "invalid" || data.status === "revoked" ? "suspected_counterfeit" : "concern";
  const primary = copy.primary;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {primary === "retry" && onRetry ? (
        <Button size="lg" onClick={onRetry} loading={busy} className="sm:col-span-2 lg:col-span-1 xl:col-span-2"><RefreshCw aria-hidden />Try again</Button>
      ) : null}
      {primary === "support" ? (
        <Button size="lg" asChild><Link href={supportHref(data, kind)}><Mail aria-hidden />Contact support</Link></Button>
      ) : null}
      {primary === "report" ? (
        <Button size="lg" asChild><Link href={supportHref(data, "concern")}><Mail aria-hidden />Tell us about this part</Link></Button>
      ) : null}
      {onAnother && primary !== "retry" ? (
        <Button size="lg" variant={primary === "another" ? "primary" : "secondary"} onClick={onAnother}><ScanLine aria-hidden />Check another part</Button>
      ) : null}
      {isVerdict && primary === "another" ? (
        <Button size="lg" variant="secondary" asChild><Link href={supportHref(data, "concern")}>Report a concern <ArrowUpRight aria-hidden /></Link></Button>
      ) : null}
      {contact.supportPhone && (primary === "support" || primary === "report") ? (
        <Button size="lg" variant="secondary" asChild><a href={`tel:${contact.supportPhone.replace(/[^+\d]/g, "")}`}><Phone aria-hidden />{contact.supportPhone}</a></Button>
      ) : null}
      {contact.supportEmail && (primary === "support" || primary === "report") ? (
        <Button size="lg" variant="secondary" asChild className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
          <a href={`mailto:${contact.supportEmail}?subject=${encodeURIComponent(`Part check ${shortRequestRef(data.requestId)}${data.reference ? ` ${data.reference}` : ""}`)}`}><Mail aria-hidden />{contact.supportEmail}</a>
        </Button>
      ) : null}
    </div>
  );
}
