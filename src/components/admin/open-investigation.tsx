"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { openInvestigation } from "@/app/admin/investigations/actions";

/**
 * Staff-initiated case for one part (for example after a support report). The database allows one open case
 * per unit, so asking again simply takes you to the existing one.
 */
export function OpenInvestigationButton({ unitId, serial }: { unitId: string; serial: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [summary, setSummary] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const valid = summary.trim().length >= 3;

  async function submit() {
    setBusy(true); setError(null);
    const r = await openInvestigation({ unitId, summary: summary.trim() });
    setBusy(false);
    if (r.ok && r.data) { toast.success("Investigation opened"); setOpen(false); router.push(`/admin/investigations/${r.data.id}`); }
    else if (!r.ok) setError(r.fieldErrors?.summary ?? r.error);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><ShieldQuestion aria-hidden />Open investigation</Button>
      <Dialog open={open} onOpenChange={(v) => { if (busy) return; setOpen(v); if (!v) { setSummary(""); setError(null); } }}>
        <DialogContent title="Open an investigation" description={`Ask someone to take a closer look at ${serial}. Scan patterns are hints, never proof, and nothing is shown to customers.`}>
          <Field label="What are you concerned about?" required error={error} hint="For example: a customer reported a label that looks different. Staff can read this.">
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} maxLength={1000} />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} loading={busy} disabled={!valid}>Open investigation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
