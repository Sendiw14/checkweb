"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ReasonDialog } from "@/components/admin/batch-actions";
import { activateRecall, closeRecall } from "@/app/admin/recalls/actions";
import { formatNumber } from "@/lib/utils";

export function RecallControls({ recallId, reference, status, impacted, canActivate }: { recallId: string; reference: string; status: string; impacted: number; canActivate: boolean }) {
  const router = useRouter();
  const [dlg, setDlg] = React.useState<null | "activate" | "close">(null);
  if (!canActivate || status === "closed") return null;
  return (
    <>
      {status === "draft" ? <Button variant="danger" onClick={() => setDlg("activate")}><Megaphone aria-hidden />Approve and activate…</Button> : null}
      {status === "active" ? <Button variant="secondary" onClick={() => setDlg("close")}><Square aria-hidden />Close recall…</Button> : null}
      <ConfirmDialog open={dlg === "activate"} onOpenChange={(v) => setDlg(v ? "activate" : null)} tone="danger" title="Activate this recall?" confirmLabel="Activate recall" requireText="RECALL"
        description={<><p>Activating makes the customer instructions live <b>immediately</b>. Anyone who scans one of the <b>{formatNumber(impacted)}</b> covered units will see them, and those units will show as recalled instead of recognized.</p><p className="mt-2">By activating you approve the customer text exactly as written. This is recorded in the audit log under your name.</p></>}
        onConfirm={async () => { const r = await activateRecall(recallId); if (r.ok) { toast.success(`${reference} is now active (${formatNumber(r.data?.impacted ?? 0)} units)`); router.refresh(); } else { toast.error(r.error); throw new Error(r.error); } }} />
      <ReasonDialog open={dlg === "close"} onOpenChange={(v) => setDlg(v ? "close" : null)} tone="primary" title="Close this recall" confirmLabel="Close recall"
        description="Customers who scan covered units will stop seeing recall instructions and see the normal result for each unit's state. If affected units are still unsafe, quarantine them first."
        onSubmit={async (note) => { const r = await closeRecall(recallId, { note }); if (r.ok) { toast.success("Recall closed"); router.refresh(); } else { toast.error(r.error); throw new Error(r.error); } }} />
    </>
  );
}
