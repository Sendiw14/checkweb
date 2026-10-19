import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/server/auth/guards";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requirePermission("products.write");
  return (
    <>
      <PageHeader title="New product" crumbs={[{ label: "Products", href: "/admin/products" }, { label: "New product" }]} description="You can add a photo after the product is created." />
      <Card className="max-w-3xl"><CardContent className="pt-6 sm:pt-6"><ProductForm mode="create" /></CardContent></Card>
    </>
  );
}
