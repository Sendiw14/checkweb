import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/server/auth/guards";

export const metadata = { title: "Access denied" };

export default async function AccessDenied() {
  await requireStaff({ allowMfaPending: true });
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState tone="danger" icon={<ShieldX />} title="You don't have access to that" description="Your role doesn't include this part of the workspace. Nothing was changed. If you need it, ask an owner or administrator to adjust your role." action={<Button asChild variant="secondary"><Link href="/admin/dashboard">Back to the dashboard</Link></Button>} />
    </div>
  );
}
