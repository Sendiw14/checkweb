"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Ellipsis, Pause, PrinterCheck, RotateCcw, Tag as TagIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ReasonDialog } from "@/components/admin/batch-actions";
import { requestLabelReplacement, reportLabelDamage, revokeToken, transitionUnit } from "@/app/admin/part-units/actions";

type Dlg = null | "revoke" | "replace" | "quarantine" | "restore" | "retire" | "damage";

export function UnitActions({ unitId, serial, lifecycle, hasActiveToken, can }: {
  unitId: string; serial: string; lifecycle: string; hasActiveToken: boolean; can: { reissue: boolean; quarantine: boolean; retire: boolean; confirmLabels: boolean };
}) {
  const router = useRouter();
  const [dlg, setDlg] = React.useState<Dlg>(null);
  const retired = lifecycle === "retired";
  const ok = (m: string) => { toast.success(m); router.refresh(); };
  const fail = (m: string) => { toast.error(m); throw new Error(m); };
  if (retired || (!can.reissue && !can.quarantine && !can.retire && !can.confirmLabels)) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {can.reissue ? <Button variant="secondary" onClick={() => setDlg("replace")}><TagIcon aria-hidden />Replace label</Button> : null}
        {can.quarantine && lifecycle === "quarantined" ? <Button onClick={() => setDlg("restore")}><RotateCcw aria-hidden />Restore</Button> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" aria-label="More unit actions"><Ellipsis aria-hidden /></Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            {can.confirmLabels ? <DropdownMenuItem onSelect={() => setDlg("damage")}><PrinterCheck aria-hidden />Report damaged label</DropdownMenuItem> : null}
            {can.quarantine && lifecycle !== "quarantined" ? <DropdownMenuItem onSelect={() => setDlg("quarantine")}><Pause aria-hidden />Quarantine unit…</DropdownMenuItem> : null}
            {can.reissue && hasActiveToken ? (<><DropdownMenuSeparator /><DropdownMenuItem tone="danger" onSelect={() => setDlg("revoke")}><Ban aria-hidden />Revoke code…</DropdownMenuItem></>) : null}
            {can.retire ? <DropdownMenuItem tone="danger" onSelect={() => setDlg("retire")}><Trash2 aria-hidden />Retire unit…</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ReasonDialog open={dlg === "replace"} onOpenChange={(v) => setDlg(v ? "replace" : null)} tone="primary" title="Replace this label" confirmLabel="Create replacement job"
        description={<>Issues a <b>new code</b> for <span className="font-mono">{serial}</span> and generates a one-label PDF. The old code stays valid until the new label is generated, then it is withdrawn, so the old label stops working. The new label must be printed and applied.</>}
        onSubmit={async (reason) => { const r = await requestLabelReplacement(unitId, { reason }); if (r.ok && r.data) { toast.success("Replacement job created"); router.push(`/admin/label-jobs/${r.data.jobId}`); } else if (!r.ok) fail(r.error); }} />
      <ReasonDialog open={dlg === "revoke"} onOpenChange={(v) => setDlg(v ? "revoke" : null)} title="Revoke this unit's code" confirmLabel="Revoke code" requireText={serial}
        description={<>The current code for <span className="font-mono">{serial}</span> stops working immediately. Customers who scan it are told it's no longer valid. The unit will have <b>no</b> working code until you issue a replacement. Use this when a code may be compromised.</>}
        onSubmit={async (reason) => { const r = await revokeToken(unitId, { reason }); r.ok ? ok("Code revoked") : fail(r.error); }} />
      <ReasonDialog open={dlg === "quarantine"} onOpenChange={(v) => setDlg(v ? "quarantine" : null)} title="Quarantine this unit" confirmLabel="Quarantine" requireText="QUARANTINE"
        description="Customers who scan this unit are told it is on hold. You can restore it later."
        onSubmit={async (reason) => { const r = await transitionUnit(unitId, "quarantined", { reason }); r.ok ? ok("Unit quarantined") : fail(r.error); }} />
      <ReasonDialog open={dlg === "retire"} onOpenChange={(v) => setDlg(v ? "retire" : null)} title="Retire this unit" confirmLabel="Retire unit" requireText={serial}
        description="Retired units can't be released, labelled or restored. Customers who scan it are told it has been withdrawn from service. This can't be undone."
        onSubmit={async (reason) => { const r = await transitionUnit(unitId, "retired", { reason }); r.ok ? ok("Unit retired") : fail(r.error); }} />
      <ReasonDialog open={dlg === "damage"} onOpenChange={(v) => setDlg(v ? "damage" : null)} tone="primary" title="Report a damaged label" confirmLabel="Record report"
        description="Records that the printed label is damaged or unreadable. It doesn't change the code: use “Replace label” to issue a new one."
        onSubmit={async (reason) => { const r = await reportLabelDamage(unitId, { reason }); r.ok ? ok("Report recorded") : fail(r.error); }} />
      <ConfirmDialog open={dlg === "restore"} onOpenChange={(v) => setDlg(v ? "restore" : null)} title="Restore this unit?" confirmLabel="Restore"
        description="The unit returns to the state it was in before quarantine, if its code and label still allow it."
        onConfirm={async () => { const r = await transitionUnit(unitId, "restored"); r.ok ? ok("Unit restored") : fail(r.error); }} />
    </>
  );
}
