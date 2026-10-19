"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignCase, escalateCase, linkCaseUnit, setCaseStatus } from "@/app/admin/support/actions";

const NONE = "__none";

export function SupportPanel({ id, status, assignedTo, staff, meId, unitId, canManage, canEscalate, resolution }: {
  id: string; status: string; assignedTo: string | null; staff: { user_id: string; email: string; display_name: string }[]; meId: string; unitId: string | null; canManage: boolean; canEscalate: boolean; resolution: string | null;
}) {
  const router = useRouter();
  const [next, setNext] = React.useState("");
  const [text, setText] = React.useState(resolution ?? "");
  const [serial, setSerial] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  if (!canManage) return <p className="rounded-lg bg-cloud p-4 text-small text-quiet">Your role can read this case but not change it.</p>;
  const closing = ["resolved", "closed"].includes(next);
  return (
    <div className="grid content-start gap-6">
      <div className="grid gap-3 rounded-xl border border-line bg-white p-5">
        <p className="text-label">Assigned to</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-64"><Select value={assignedTo ?? NONE} onValueChange={async (v) => { const r = await assignCase(id, v === NONE ? null : v); if (r.ok) { toast.success("Assignment updated"); router.refresh(); } else { toast.error(r.error); } }}><SelectTrigger aria-label="Assigned to"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Unassigned</SelectItem>{staff.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}</SelectContent></Select></div>
          {assignedTo !== meId ? <Button variant="secondary" onClick={async () => { const r = await assignCase(id, meId); if (r.ok) { toast.success("Assigned to you"); router.refresh(); } else { toast.error(r.error); } }}>Take this case</Button> : null}
        </div>
      </div>
      <div className="grid gap-3 rounded-xl border border-line bg-white p-5">
        <p className="text-label">Part</p>
        {unitId ? (
          canEscalate ? <div><Button variant="secondary" onClick={async () => { const r = await escalateCase(id); if (r.ok && r.data) { toast.success("Investigation linked"); router.push(`/admin/investigations/${r.data.investigationId}`); } else if (!r.ok) toast.error(r.error); }}><ShieldAlert aria-hidden />Open or link an investigation</Button></div> : <p className="text-small text-quiet">A part is linked to this case.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3"><Field label="Link a serial number" className="w-64"><Input value={serial} onChange={(e) => setSerial(e.target.value)} className="text-serial uppercase" placeholder="AXM-00012345" spellCheck={false} /></Field>
            <Button variant="secondary" disabled={!serial.trim()} onClick={async () => { const r = await linkCaseUnit(id, serial); if (r.ok) { toast.success("Part linked"); setSerial(""); router.refresh(); } else { toast.error(r.error); } }}><Link2 aria-hidden />Link</Button></div>
        )}
      </div>
      <div className="grid gap-4 rounded-xl border border-line bg-white p-5">
        <p className="text-label">Update status</p>
        <div className="sm:max-w-sm"><Select value={next} onValueChange={setNext}><SelectTrigger aria-label="New status"><SelectValue placeholder={`Currently: ${status.replace("_", " ")}`} /></SelectTrigger>
          <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="waiting_customer">Waiting on the customer</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed without action</SelectItem></SelectContent></Select></div>
        {closing ? <Field label="Resolution" required error={err} hint="What happened and what was done. Kept on the case."><Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} /></Field> : null}
        <div><Button disabled={!next} loading={busy} onClick={async () => { setBusy(true); setErr(null); const r = await setCaseStatus(id, { status: next, resolution: text }); setBusy(false); if (r.ok) { toast.success("Case updated"); setNext(""); router.refresh(); } else setErr(r.fieldErrors?.resolution ?? r.error); }}>Save status</Button></div>
      </div>
    </div>
  );
}
