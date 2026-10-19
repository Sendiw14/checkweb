"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { StatusSeal } from "@/components/brand/status-seal";
import { ManualCodeForm } from "@/components/public/manual-code-form";
import { ResultView, type PublicContact } from "@/components/public/result-view";
import { Skeleton } from "@/components/ui/skeleton";
import { OFFLINE_COPY } from "@/lib/verification-copy";
import { fadeUp } from "@/lib/motion";
import type { PublicVerification } from "@/lib/verification-types";
import { stripToCredential } from "@/lib/credential-format";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; data: PublicVerification }
  | { kind: "offline" };

const TIMEOUT_MS = 15_000;

async function callVerify(credential: string): Promise<PublicVerification> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: ctl.signal,
    });
    const body = (await res.json().catch(() => null)) as PublicVerification | null;
    if (body && typeof body.status === "string") return body;
    return { status: res.status >= 500 ? "unavailable" : "error", requestId: res.headers.get("x-request-id") ?? crypto.randomUUID() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the token from the URL fragment (never sent to any server in a URL), removes it from
 * the address bar immediately, keeps it only in memory, and POSTs it to /api/verify.
 * Nothing is written to localStorage / sessionStorage / IndexedDB, and no third-party
 * script is involved.
 */
export function VerifyExperience({ contact }: { contact: PublicContact }) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const credentialRef = React.useRef<string | null>(null);
  const startedRef = React.useRef(false);

  const run = React.useCallback(async (credential: string) => {
    credentialRef.current = credential;
    setPhase({ kind: "loading" });
    try {
      const data = await callVerify(credential);
      setPhase({ kind: "result", data });
    } catch {
      // Network failure / timeout: this is NOT a verification result.
      setPhase({ kind: "offline" });
    }
  }, []);

  React.useEffect(() => {
    // Guard against React StrictMode's double effect so a scan is never submitted twice.
    if (startedRef.current) return;
    startedRef.current = true;
    const raw = window.location.hash.replace(/^#/, "");
    if (raw) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      void run(stripToCredential(decodeURIComponent(raw)));
    }
  }, [run]);

  const reset = () => {
    credentialRef.current = null;
    setPhase({ kind: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showManual = phase.kind === "idle" || (phase.kind === "result" && ["malformed", "invalid"].includes(phase.data.status));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:py-14">
      {/* Announces the state change to assistive tech without moving focus twice. */}
      <div className="sr-only" role="status" aria-live="polite">
        {phase.kind === "loading" ? "Checking this code" : phase.kind === "offline" ? "You appear to be offline" : ""}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {phase.kind === "idle" ? (
          <motion.div key="idle" variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="mx-auto max-w-xl">
            <IdlePanel contact={contact} />
          </motion.div>
        ) : null}

        {phase.kind === "loading" ? (
          <motion.div key="loading" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
            <LoadingPanel company={contact.company} />
          </motion.div>
        ) : null}

        {phase.kind === "result" ? (
          <motion.div key={`r-${phase.data.requestId}`} variants={fadeUp} initial="hidden" animate="visible" exit="exit">
            <ResultView data={phase.data} contact={contact} onRetry={credentialRef.current ? () => void run(credentialRef.current!) : undefined} onAnother={reset} />
          </motion.div>
        ) : null}

        {phase.kind === "offline" ? (
          <motion.div key="offline" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
            <ResultView
              data={{ status: "unavailable", requestId: crypto.randomUUID() }}
              copyOverride={OFFLINE_COPY}
              contact={contact}
              onRetry={credentialRef.current ? () => void run(credentialRef.current!) : undefined}
              onAnother={reset}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {showManual ? (
        <div className="mx-auto mt-8 max-w-xl rounded-xl border border-line bg-cloud p-5 sm:p-6">
          <h2 className="text-subheading">{phase.kind === "idle" ? "Enter the code by hand" : "Try entering the code instead"}</h2>
          <p className="mt-1 text-small text-quiet">If the QR code is scuffed or won't scan, type the code printed beneath it.</p>
          <ManualCodeForm className="mt-4" onSubmitCode={run} inputId="manual-code" />
        </div>
      ) : null}
    </div>
  );
}

function IdlePanel({ contact }: { contact: PublicContact }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-6 text-center sm:p-9">
      <div aria-hidden className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative flex flex-col items-center">
        <StatusSeal tone="brand" icon="scan" size={88} />
        <h1 className="text-title mt-6">Check a {contact.company} part</h1>
        <p className="text-lead mt-3 !max-w-md">
          Point your phone's camera at the QR code on the part and tap the link that appears. We'll look the code up and tell you what we find. No app or account needed.
        </p>
      </div>
    </div>
  );
}

function LoadingPanel({ company }: { company: string }) {
  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" aria-busy="true">
      <div className="rounded-2xl border border-line bg-cloud p-5 sm:p-7">
        <p className="text-eyebrow !text-quiet">Checking…</p>
        <div className="mt-5 flex items-start gap-4">
          <div className="relative grid size-[72px] place-items-center" aria-hidden>
            <svg viewBox="0 0 100 100" className="size-full animate-spin motion-reduce:animate-none [animation-duration:1.4s]">
              <circle cx="50" cy="50" r="46" className="fill-none stroke-line-strong" strokeWidth="3" />
              <circle cx="50" cy="50" r="46" pathLength={100} className="fill-none stroke-brand" strokeWidth="3" strokeLinecap="round" strokeDasharray="28 72" />
            </svg>
          </div>
          <div className="flex-1 pt-1">
            <p className="text-title" role="presentation">Checking this code</p>
            <p className="mt-1 text-small text-quiet">Looking it up in {company}'s records.</p>
          </div>
        </div>
        <div className="mt-6 space-y-2.5" aria-hidden>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
      <div className="hidden lg:block" aria-hidden>
        <div className="border border-line bg-white">
          <Skeleton className="aspect-[16/9] rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
