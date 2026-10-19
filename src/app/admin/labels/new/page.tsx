import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { LabelWizard } from "@/components/admin/label-wizard";
import { requirePermission } from "@/server/auth/guards";
import { labelSpecSchema } from "@/server/labels/spec";
import { labelableBatches } from "@/server/repos/labels";
import { qrPath } from "@/server/qr";
import { buildVerificationUrl, generateToken } from "@/server/security/tokens";
import { getSiteSettings, siteUrl } from "@/server/settings";

export const metadata: Metadata = { title: "Generate labels" };

export default async function NewLabelJobPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  await requirePermission("labels.generate");
  const [batches, settings, sp] = await Promise.all([labelableBatches(), getSiteSettings(), searchParams]);
  const defaults = labelSpecSchema.parse(settings.labelSpec);
  // A throwaway token only to size the QR symbol; it's never stored or shown.
  const sample = buildVerificationUrl(siteUrl(), generateToken());
  const qrByEc = { M: qrPath(sample, "M"), Q: qrPath(sample, "Q"), H: qrPath(sample, "H") };
  return (
    <>
      <PageHeader title="Generate labels" crumbs={[{ label: "QR labels", href: "/admin/labels" }, { label: "Generate" }]} description="Issue secret codes for a batch and produce print-ready sheets." />
      <LabelWizard batches={batches} defaults={defaults} qrByEc={qrByEc} initialBatch={sp.batch} daysToExpiry={Number(settings.retention.labelArtifactDays ?? 14)} />
    </>
  );
}
