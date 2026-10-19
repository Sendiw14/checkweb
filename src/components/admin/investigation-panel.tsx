"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Send, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addNote, assignInvestigation, setInvestigationStatus } from "@/app/admin/investigations/actions";

const UNASSIGNED = "__none";

export function InvestigationPanel({ id, status, assignedTo, staff, meId, canManage }: {
  id: string; status: string; assignedTo: string | null; staff: { user_id: string; email: string; display_name: string }[]; meId: string; canManage: boolean;
}) {
  const router = useRouter();
  const open = ["open", "in_review"].includes(status);
  const note = useForm<{ body: string }>({ defaultValues: { body: "" } });
  const [next, setNext] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  if (!canManage) return null;

  return (
    <div className="grid gap-6">
      {open ? (
        <div className="grid gap-4 rounded-xl border border-line bg-white p-5">
          <p className="text-label">Assignment</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-64">
              <Select value={assignedTo ?? UNASSIGNED} onValueChange={async (v) => { const r = await assignInvestigation(id, v === UNASSIGNED ? null : v); if (r.ok) { toast.success("Assignment updated"); router.refresh(); } else { toast.error(r.error); } }}>
                <SelectTrigger aria-label="Assigned to"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={UNASSIGNED}>Unassigned</SelectItem>{staff.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{s.display_name || s.email}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {assignedTo !== meId ? <Button variant="secondary" onClick={async () => { const r = await assignInvestigation(id, meId); if (r.ok) { toast.success("Assigned to you"); router.refresh(); } else { toast.error(r.error); } }}><UserCheck aria-hidden />Take this case</Button> : null}
          </div>
        </div>
      ) : null}

      <form noValidate className="grid gap-3 rounded-xl border border-line bg-white p-5" onSubmit={note.handleSubmit(async (v) => {
        const r = await addNote(id, v);
        if (r.ok) { note.reset(); toast.success("Note added"); router.refresh(); } else note.setError("body", { message: r.fieldErrors?.body ?? r.error });
      })}>
        <Field label="Add a note" error={note.formState.errors.body?.message} hint="Notes are visible to staff who can see investigations."><Textarea {...note.register("body")} rows={3} maxLength={4000} /></Field>
        <div><Button type="submit" variant="secondary" loading={note.formState.isSubmitting}><Send aria-hidden />Add note</Button></div>
      </form>

      <div className="grid gap-4 rounded-xl border border-line bg-white p-5">
        <p className="text-label">{open ? "Resolve or update" : "Reopen"}</p>
        <div className="grid gap-3 sm:max-w-sm">
          <Select value={next} onValueChange={setNext}>
            <SelectTrigger aria-label="New status"><SelectValue placeholder="Choose an outcome…" /></SelectTrigger>
            <SelectContent>
              {open ? <SelectItem value="in_review">In review</SelectItem> : <SelectItem value="open">Reopen</SelectItem>}
              <SelectItem value="resolved_benign">Resolved: benign (ordinary explanation)</SelectItem>
              <SelectItem value="resolved_confirmed">Resolved: counterfeit confirmed</SelectItem>
              <SelectItem value="dismissed">Dismissed (not worth pursuing)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {next && !["open", "in_review"].includes(next) ? <Field label="What did you find?" required error={err} hint="Required, and kept as the permanent record of this decision."><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} /></Field> : null}
        <div><Button disabled={!next} loading={busy} onClick={async () => {
          setBusy(true); setErr(null);
          const r = await setInvestigationStatus(id, { status: next, notes });
          setBusy(false);
          if (r.ok) { toast.success("Status updated"); setNext(""); setNotes(""); router.refresh(); } else setErr(r.fieldErrors?.notes ?? r.error);
        }}>Update status</Button></div>
      </div>
    </div>
  );
}
