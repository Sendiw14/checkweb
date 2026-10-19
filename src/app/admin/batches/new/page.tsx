import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { BatchForm } from "@/components/admin/batch-form";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/guards";
import { activeProducts } from "@/server/repos/batches";

export const metadata: Metadata = { title: "New batch" };

export default async function NewBatchPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  await requirePermission("batches.write");
  const [products, sp] = await Promise.all([activeProducts(), searchParams]);
  return (
    <>
      <PageHeader title="New batch" crumbs={[{ label: "Batches", href: "/admin/batches" }, { label: "New batch" }]} description="Register a manufacturing batch. Codes and labels are issued later in a controlled step." />
      <Card className="max-w-3xl"><CardContent className="pt-6 sm:pt-6"><BatchForm products={products} defaultProduct={sp.product} /></CardContent></Card>
    </>
  );
}
