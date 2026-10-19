import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Shown when an id in the URL doesn't exist (the caller was already authorised to look; permission checks run first). */
export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon={<SearchX />} title="We couldn't find that"
        description="It may have been removed, or the link may be wrong. Nothing was changed."
        action={<Button asChild variant="secondary"><Link href="/admin/dashboard">Back to the dashboard</Link></Button>}
      />
    </div>
  );
}
