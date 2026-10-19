import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { CompanyForm, LabelDefaultsForm, LogoCard, RetentionForm, RiskForm } from "@/components/admin/settings-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { labelSpecSchema } from "@/server/labels/spec";
import { getSiteSettings } from "@/server/settings";
import { productImageUrl } from "@/server/storage/images";
import { riskSchema, retentionSchema } from "@/lib/schemas/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const staff = await requirePermission("settings.read");
  const s = await getSiteSettings();
  const canWrite = can(staff.role, "settings.write");
  const defaults = { rapidWindowMinutes: 10, rapidScans: 5, networkWindowHours: 24, distinctNetworks: 3, distinctCountries: 2, lifetimeScans: 50, revokedScans24h: 3, suspiciousScore: 2 };
  const retentionDefaults = { verificationNetworkDays: 90, supportCaseDays: 365, labelArtifactDays: 14 };
  return (
    <>
      <PageHeader title="Settings" description="Company identity, support details, label defaults, repeat-check rules and data retention. Every change is audited." />
      <Tabs defaultValue="company">
        <TabsList aria-label="Settings sections"><TabsTrigger value="company">Company</TabsTrigger><TabsTrigger value="branding">Logo</TabsTrigger><TabsTrigger value="labels">Labels</TabsTrigger><TabsTrigger value="risk">Repeat-check rules</TabsTrigger><TabsTrigger value="retention">Retention</TabsTrigger></TabsList>
        <TabsContent value="company"><Card className="max-w-4xl"><CardHeader><CardTitle as="h2">Company and support</CardTitle><CardDescription>What customers see on the public site and result pages.</CardDescription></CardHeader><CardContent>
          <CompanyForm canWrite={canWrite} initial={{ companyName: s.companyName, legalName: s.legalName ?? "", supportEmail: s.supportEmail ?? "", supportPhone: s.supportPhone ?? "", websiteUrl: s.websiteUrl ?? "", privacyUrl: s.privacyUrl ?? "", termsUrl: s.termsUrl ?? "", brandTheme: s.brandTheme, serialPrefix: s.serialPrefix }} /></CardContent></Card></TabsContent>
        <TabsContent value="branding"><Card className="max-w-2xl"><CardHeader><CardTitle as="h2">Logo</CardTitle></CardHeader><CardContent><LogoCard company={s.companyName} logoUrl={productImageUrl(s.logoPath)} canWrite={canWrite} /></CardContent></Card></TabsContent>
        <TabsContent value="labels"><Card className="max-w-4xl"><CardHeader><CardTitle as="h2">Label defaults</CardTitle></CardHeader><CardContent><LabelDefaultsForm canWrite={canWrite} initial={labelSpecSchema.parse(s.labelSpec)} /></CardContent></Card></TabsContent>
        <TabsContent value="risk"><Card className="max-w-4xl"><CardHeader><CardTitle as="h2">Repeat-check rules</CardTitle><CardDescription>Explainable thresholds, not a black box.</CardDescription></CardHeader><CardContent><RiskForm canWrite={canWrite} initial={riskSchema.parse({ ...defaults, ...s.riskThresholds })} /></CardContent></Card></TabsContent>
        <TabsContent value="retention"><Card className="max-w-4xl"><CardHeader><CardTitle as="h2">Data retention</CardTitle></CardHeader><CardContent><RetentionForm canWrite={canWrite} initial={retentionSchema.parse({ ...retentionDefaults, ...s.retention })} /></CardContent></Card></TabsContent>
      </Tabs>
    </>
  );
}
