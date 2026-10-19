import type { PublicVerification } from "@/lib/verification-types";

export const MOCKS: Record<string, PublicVerification> = {
  recognized_first: { status: "recognized_first", requestId: "1a2b3c4d-0000-0000-0000-000000000000", reference: "AXM-00012345", product: { name: "Ceramic Brake Pad Set, Front", partNumber: "BP-2041", brand: "Axiom", category: "Brakes" } },
  recognized_repeat: { status: "recognized_repeat", requestId: "1a2b3c4d-0000-0000-0000-000000000000", reference: "AXM-00012345", firstVerifiedAt: "2026-09-14T10:00:00Z", previousScanCount: 3, product: { name: "Ceramic Brake Pad Set, Front", partNumber: "BP-2041", brand: "Axiom", category: "Brakes" } },
  recalled: { status: "recalled", requestId: "1a2b3c4d-0000-0000-0000-000000000000", reference: "AXM-00012345", product: { name: "Ceramic Brake Pad Set, Front", partNumber: "BP-2041" }, recall: { reference: "RCL-2610-0001", title: "Front brake pad friction material", instructions: "Stop using the affected pads and do not fit them. Contact us on the number below and quote this reference for a free replacement.", issuedAt: "2026-10-02T00:00:00Z" } },
  invalid: { status: "invalid", requestId: "1a2b3c4d-0000-0000-0000-000000000000" },
};

