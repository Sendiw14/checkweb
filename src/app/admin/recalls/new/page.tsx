import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { RecallForm } from "@/components/admin/recall-form";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "New recall" };

export default async function NewRecallPage() {
  await requirePermission("recalls.write");
  return (
    <>
      <PageHeader title="New recall" crumbs={[{ label: "Recalls", href: "/admin/recalls" }, { label: "New recall" }]} description="Start as a draft. Nothing reaches customers until someone with approval rights activates it." />
      <Card className="max-w-3xl"><CardContent className="pt-6 sm:pt-6"><RecallForm mode="create" /></CardContent></Card>
    </>
  );
}
