import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { first } from "@/server/db/sql";
import { listRecalls } from "@/server/repos/recalls";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Recalls" };

export default async function RecallsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requirePermission("recalls.read");
  const sp = await searchParams;
  const status = first(sp.status);
  const rows = await listRecalls(["draft", "active", "closed"].includes(status ?? "") ? status : undefined);
  return (
    <>
      <PageHeader title="Recalls" description="A recall changes what customers see when they check an affected part. Only approved wording is ever shown." actions={can(staff.role, "recalls.write") ? <Button asChild><Link href="/admin/recalls/new"><Plus aria-hidden />New recall</Link></Button> : null} />
      <ListToolbar showSearchless filters={[{ param: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "closed", label: "Closed" }] }]} />
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-white"><EmptyState icon={<Megaphone />} title={status ? "No recalls in that state" : "No recalls"} description="Create a recall to warn customers who check an affected part." action={can(staff.role, "recalls.write") ? <Button asChild><Link href="/admin/recalls/new"><Plus aria-hidden />New recall</Link></Button> : undefined} /></div>
        ) : (
          <ul className="grid gap-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/recalls/${r.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-md sm:p-5">
                  <div className="min-w-0"><p className="font-mono text-caption text-quiet">{r.reference}</p><p className="mt-0.5 truncate text-subheading">{r.title}</p>
                    <p className="mt-1 text-small text-quiet">Covers {r.products ? `${r.products} product${r.products === 1 ? "" : "s"}` : ""}{r.products && (r.batches || r.units) ? ", " : ""}{r.batches ? `${r.batches} batch${r.batches === 1 ? "" : "es"}` : ""}{r.batches && r.units ? ", " : ""}{r.units ? `${r.units} unit${r.units === 1 ? "" : "s"}` : ""}{!r.products && !r.batches && !r.units ? "nothing yet" : ""}</p></div>
                  <div className="flex items-center gap-4"><span className="text-small text-quiet">{r.issued_at ? `Issued ${formatDate(r.issued_at)}` : `Created ${formatDate(r.created_at)}`}</span><StatusBadge kind="recall" value={r.status} /></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
