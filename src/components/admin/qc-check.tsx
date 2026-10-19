"use client";
import * as React from "react";
import { ScanSearch } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/admin/status";
import { qcCheck, type QcResult } from "@/app/admin/labels/actions";

/**
 * For checking printed labels without counting as a customer. Paste the label's address (a USB barcode
 * scanner types it for you) or the backup code. Recorded as an internal QC check.
 */
export function QcCheck() {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<QcResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <form noValidate className="grid gap-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null); setRes(null);
      const r = await qcCheck({ credential: value });
      setBusy(false);
      if (r.ok && r.data) { setRes(r.data); setValue(""); } else if (!r.ok) setErr(r.fieldErrors?.credential ?? r.error);
    }}>
      <Field label="Label address or backup code" hint="Scan with a USB scanner (it types the address) or paste it. Don't use your phone camera: that opens the public page and counts as a customer check.">
        <Input value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck={false} placeholder="https://… or ABCD-EFGH-JKMN-PQRS-TVWX" className="font-mono text-small" />
      </Field>
      <div><Button type="submit" variant="secondary" loading={busy} disabled={!value.trim()}><ScanSearch aria-hidden />Check label</Button></div>
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {res ? (
        <div role="status" className="rounded-lg border border-line bg-cloud p-4 text-small">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge kind="result" value={res.result} />{res.serial ? <span className="text-serial text-ink">{res.serial}</span> : null}</div>
          {res.product ? <p className="mt-2 text-body">{res.product} · {res.partNumber}</p> : <p className="mt-2 text-body">No unit matched this code.</p>}
          {res.lifecycle ? <p className="text-caption text-quiet">Lifecycle: {res.lifecycle.replace("_", " ")}</p> : null}
          <p className="mt-2 text-caption text-quiet">Recorded as a staff QC check. It was <b>not</b> counted as a customer verification.</p>
        </div>
      ) : null}
    </form>
  );
}
