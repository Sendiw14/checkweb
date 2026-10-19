"use client";
import { ResultView, type PublicContact } from "@/components/public/result-view";
import { OFFLINE_COPY } from "@/lib/verification-copy";
import type { PublicVerification } from "@/lib/verification-types";

export function Gallery({ data, contact, offline }: { data: PublicVerification; contact: PublicContact; offline: boolean }) {
  return <ResultView data={data} contact={contact} copyOverride={offline ? OFFLINE_COPY : undefined} onRetry={() => {}} onAnother={() => {}} />;
}
