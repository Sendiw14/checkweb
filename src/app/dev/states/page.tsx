import { notFound } from "next/navigation";
import { Gallery } from "./gallery";
import { MOCKS } from "@/components/public/result-mocks";
import type { PublicVerification } from "@/lib/verification-types";

export const dynamic = "force-dynamic";

const R = "1a2b3c4d-0000-0000-0000-000000000000";
const product = { name: "Ceramic Brake Pad Set, Front", partNumber: "BP-2041", brand: "Axiom", category: "Brakes" };
const ALL: Record<string, PublicVerification> = {
  ...MOCKS,
  suspicious: { status: "suspicious", requestId: R, reference: "AXM-00012345", firstVerifiedAt: "2026-09-14T10:00:00Z", previousScanCount: 11, product },
  quarantined: { status: "quarantined", requestId: R, reference: "AXM-00012345", product },
  not_released: { status: "not_released", requestId: R, reference: "AXM-00012345", product },
  retired: { status: "retired", requestId: R, reference: "AXM-00012345", product },
  revoked: { status: "revoked", requestId: R },
  malformed: { status: "malformed", requestId: R },
  rate_limited: { status: "rate_limited", requestId: R, retryAfterSeconds: 600 },
  unavailable: { status: "unavailable", requestId: R },
  error: { status: "error", requestId: R },
};

/** Developer gallery of every result state for visual QA. Not available in production. */
export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { s = "recognized_first" } = await searchParams;
  const contact = { company: "Axiom Motive", supportEmail: "support@axiom.example", supportPhone: "+94 11 000 0000" };
  const offline = s === "offline";
  const data = offline ? { status: "unavailable" as const, requestId: R } : (ALL[s] ?? ALL.recognized_first!);
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:py-14">
      <Gallery data={data} contact={contact} offline={offline} />
    </div>
  );
}
