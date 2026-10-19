import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { MfaCard, PasswordCard, SessionsCard } from "@/components/admin/security-panels";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/guards";
import { PRIVILEGED_ROLES, ROLE_LABELS } from "@/server/auth/permissions";
import { createSupabaseServerClient } from "@/server/auth/supabase";
import { getEnv } from "@/server/env";

export const metadata: Metadata = { title: "Account security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const staff = await requireStaff({ next: "/admin/security", allowMfaPending: true });
  const { required } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enrolled = !!factors?.totp.some((f) => f.status === "verified");
  const requiredByPolicy = getEnv().REQUIRE_MFA_FOR_PRIVILEGED && PRIVILEGED_ROLES.includes(staff.role);
  return (
    <>
      <PageHeader title="Account security" description="Protect your own sign-in. These settings apply to you only." />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-3 pt-5 text-small sm:grid-cols-3 sm:pt-6">
            <div><p className="text-caption text-quiet">Name</p><p className="font-medium text-ink">{staff.displayName}</p></div>
            <div className="min-w-0"><p className="text-caption text-quiet">Email</p><p className="break-words font-medium text-ink">{staff.email}</p></div>
            <div><p className="text-caption text-quiet">Role</p><p className="font-medium text-ink">{ROLE_LABELS[staff.role]}</p></div>
          </CardContent>
        </Card>
        <MfaCard enrolled={enrolled} aal2={staff.aal === "aal2"} requiredByPolicy={requiredByPolicy} mustFinish={required === "1" || staff.mfaRequired} />
        <PasswordCard />
        <SessionsCard />
      </div>
    </>
  );
}
