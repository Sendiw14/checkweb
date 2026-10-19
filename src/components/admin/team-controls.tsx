"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Ellipsis, KeyRound, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteSchema, type InviteInput } from "@/lib/schemas/team";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, canManageRole } from "@/server/auth/permissions";
import { ROLES, type Role } from "@/server/domain/enums";
import { changeRole, createAccessLink, inviteStaff, setMemberStatus } from "@/app/admin/team/actions";

function LinkBox({ link, note }: { link: string; note: string }) {
  return (
    <div className="grid gap-3">
      <Alert tone="warning" title="Copy this link now">{note}</Alert>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-cloud p-2 pl-3"><code className="min-w-0 flex-1 truncate font-mono text-caption text-ink" title="Setup link">{link}</code>
        <Button size="sm" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); toast.success("Link copied"); } catch { toast.error("Couldn't copy: select the text instead."); } }}><Copy aria-hidden />Copy</Button></div>
    </div>
  );
}

export function InviteButton({ actorRole }: { actorRole: Role }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<{ link: string; email: string } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const roles = ROLES.filter((r) => canManageRole(actorRole, r));
  const { register, control, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<InviteInput>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", displayName: "", role: undefined as unknown as Role } });
  return (
    <>
      <Button onClick={() => setOpen(true)}><UserPlus aria-hidden />Invite someone</Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setResult(null); setErr(null); reset(); } }}>
        <DialogContent title={result ? "Invitation ready" : "Invite a team member"} description={result ? undefined : "They set their own password using a one-time link. Nobody else ever sees it."}>
          {result ? (
            <>
              <LinkBox link={result.link} note={`Send this to ${result.email} through a channel you trust. It works once and expires soon. It won't be shown again.`} />
              <DialogFooter><Button onClick={() => { setOpen(false); router.refresh(); }}>Done</Button></DialogFooter>
            </>
          ) : (
            <form noValidate className="grid gap-4" onSubmit={handleSubmit(async (v) => {
              setErr(null);
              const r = await inviteStaff(v);
              if (r.ok && r.data) { setResult(r.data); router.refresh(); } else if (!r.ok) { setErr(r.error); for (const [f, m] of Object.entries(r.fieldErrors ?? {})) setError(f as keyof InviteInput, { message: m }); }
            })}>
              {err ? <Alert tone="danger">{err}</Alert> : null}
              <Field label="Full name" required error={errors.displayName?.message}><Input {...register("displayName")} autoComplete="off" /></Field>
              <Field label="Work email" required error={errors.email?.message}><Input {...register("email")} type="email" autoComplete="off" autoCapitalize="none" /></Field>
              <Field label="Role" required error={errors.role?.message} hint="What they're allowed to do. You can change it later.">
                <Controller control={control} name="role" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
                    <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent></Select>
                )} />
              </Field>
              <DialogFooter><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={isSubmitting}>Create invitation</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MemberActions({ userId, name, email, role, status, actorRole, isSelf }: { userId: string; name: string; email: string; role: Role; status: "active" | "suspended"; actorRole: Role; isSelf: boolean }) {
  const router = useRouter();
  const [dlg, setDlg] = React.useState<null | "suspend" | "reactivate" | "link">(null);
  const [link, setLink] = React.useState<string | null>(null);
  const manageable = !isSelf && canManageRole(actorRole, role);
  if (!manageable) return <span className="text-caption text-quiet">{isSelf ? "You" : "—"}</span>;
  const grantable = ROLES.filter((r) => canManageRole(actorRole, r));
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}><Ellipsis aria-hidden /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Change role</DropdownMenuLabel>
          {grantable.filter((r) => r !== role).map((r) => <DropdownMenuItem key={r} onSelect={async () => { const res = await changeRole(userId, r); if (res.ok) { toast.success(`${name} is now ${ROLE_LABELS[r]}`); router.refresh(); } else { toast.error(res.error); } }}>{ROLE_LABELS[r]}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={async () => { const r = await createAccessLink(userId); if (r.ok && r.data) { setLink(r.data.link); setDlg("link"); } else if (!r.ok) toast.error(r.error); }}><KeyRound aria-hidden />New sign-in link…</DropdownMenuItem>
          {status === "active" ? <DropdownMenuItem tone="danger" onSelect={() => setDlg("suspend")}>Suspend access…</DropdownMenuItem> : <DropdownMenuItem onSelect={() => setDlg("reactivate")}>Reactivate access…</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={dlg === "suspend"} onOpenChange={(v) => setDlg(v ? "suspend" : null)} tone="danger" title={`Suspend ${name}?`} confirmLabel="Suspend"
        description={<><p>{email} will lose access to the staff area <b>immediately</b> and any open sessions stop working. Their history is kept.</p><p className="mt-2">You can reactivate them later.</p></>}
        onConfirm={async () => { const r = await setMemberStatus(userId, "suspended"); if (r.ok) { toast.success("Access suspended"); router.refresh(); } else { toast.error(r.error); throw new Error(r.error); } }} />
      <ConfirmDialog open={dlg === "reactivate"} onOpenChange={(v) => setDlg(v ? "reactivate" : null)} title={`Reactivate ${name}?`} confirmLabel="Reactivate" description="They can sign in again with their existing password."
        onConfirm={async () => { const r = await setMemberStatus(userId, "active"); if (r.ok) { toast.success("Access restored"); router.refresh(); } else { toast.error(r.error); throw new Error(r.error); } }} />
      <Dialog open={dlg === "link"} onOpenChange={(v) => { if (!v) { setDlg(null); setLink(null); } }}>
        <DialogContent title="Sign-in link">{link ? <LinkBox link={link} note={`Send this to ${email} through a trusted channel. It lets them set a new password, works once, and won't be shown again.`} /> : null}<DialogFooter><Button onClick={() => { setDlg(null); setLink(null); }}>Done</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  );
}

export { ROLE_DESCRIPTIONS };
