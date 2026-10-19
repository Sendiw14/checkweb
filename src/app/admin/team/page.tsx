import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status";
import { InviteButton, MemberActions } from "@/components/admin/team-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrapper } from "@/components/ui/table";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/guards";
import { createSupabaseAdminClient } from "@/server/auth/supabase";
import { appPool } from "@/server/db/pool";
import { ROLES, type Role } from "@/server/domain/enums";
import { formatDateTime, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const staff = await requirePermission("team.read");
  const { rows } = await appPool().query<{ user_id: string; email: string; display_name: string; role: Role; status: "active" | "suspended"; created_at: Date }>(
    "select user_id, email, display_name, role, status, created_at from public.admin_memberships order by (status = 'active') desc, case role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(email)");
  // Last sign-in lives in Supabase Auth, not in our tables.
  const lastSeen = new Map<string, string | null>();
  try {
    const { data } = await createSupabaseAdminClient().auth.admin.listUsers({ perPage: 200 });
    for (const u of data?.users ?? []) lastSeen.set(u.id, u.last_sign_in_at ?? null);
  } catch { /* shown as unknown */ }
  const canManage = can(staff.role, "team.manage");

  return (
    <>
      <PageHeader title="Team" description="Everyone with access to this workspace. Each person has their own login; shared accounts aren't supported." actions={canManage ? <InviteButton actorRole={staff.role} /> : null} />
      <TableWrapper label="Team members" className="border border-line bg-white">
        <Table>
          <caption className="sr-only">Team members</caption>
          <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead className="max-lg:hidden">Last sign-in</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell><div className="flex items-center gap-3"><span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-subtle text-caption font-semibold text-ink">{initials(m.display_name || m.email)}</span><div className="min-w-0"><p className="truncate font-semibold text-ink">{m.display_name || m.email}{m.user_id === staff.userId ? <Badge className="ml-2" tone="brand">You</Badge> : null}</p><p className="truncate text-caption text-quiet">{m.email}</p></div></div></TableCell>
                <TableCell><span className="text-small text-ink">{ROLE_LABELS[m.role]}</span></TableCell>
                <TableCell><StatusBadge kind="member" value={m.status} /></TableCell>
                <TableCell className="max-lg:hidden text-quiet">{lastSeen.get(m.user_id) ? formatDateTime(lastSeen.get(m.user_id)!) : "Not yet"}</TableCell>
                <TableCell className="text-right">{canManage ? <MemberActions userId={m.user_id} name={m.display_name || m.email} email={m.email} role={m.role} status={m.status} actorRole={staff.role} isSelf={m.user_id === staff.userId} /> : null}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>
      <Card className="mt-6">
        <CardHeader><CardTitle as="h2">What each role can do</CardTitle><CardDescription>Permissions are enforced on the server for every action, not just hidden in the interface.</CardDescription></CardHeader>
        <CardContent><dl className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">{ROLES.map((r) => <div key={r}><dt className="text-small font-semibold text-ink">{ROLE_LABELS[r]}</dt><dd className="text-small text-quiet">{ROLE_DESCRIPTIONS[r]}</dd></div>)}</dl></CardContent>
      </Card>
    </>
  );
}
