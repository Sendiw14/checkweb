"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addRecallScope, removeRecallScope } from "@/app/admin/recalls/actions";

type Scope = { products: { id: string; sku: string; name: string }[]; batches: { id: string; batch_code: string; product_name: string }[]; units: { id: string; serial_number: string }[] };
type Choices = { products: { id: string; sku: string; name: string }[]; batches: { id: string; batch_code: string; product_name: string }[] };

export function RecallScope({ recallId, scope, choices, editable }: { recallId: string; scope: Scope; choices: Choices; editable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [product, setProduct] = React.useState("");
  const [batch, setBatch] = React.useState("");
  const [serials, setSerials] = React.useState("");
  const [note, setNote] = React.useState<string | null>(null);
  const empty = !scope.products.length && !scope.batches.length && !scope.units.length;

  async function add(input: unknown, reset: () => void) {
    setBusy(true); setNote(null);
    const r = await addRecallScope(recallId, input);
    setBusy(false);
    if (r.ok && r.data) { reset(); toast.success(r.data.added ? `Added ${r.data.added}` : "Already covered"); if (r.data.unknown.length) setNote(`Not found and skipped: ${r.data.unknown.slice(0, 8).join(", ")}${r.data.unknown.length > 8 ? ` and ${r.data.unknown.length - 8} more` : ""}.`); router.refresh(); }
    else if (!r.ok) toast.error(r.error);
  }
  async function remove(kind: "product" | "batch" | "unit", id: string) {
    const r = await removeRecallScope(recallId, kind, id);
    if (r.ok) { toast.success("Removed"); router.refresh(); } else { toast.error(r.error); }
  }
  const chip = (label: React.ReactNode, onRemove: () => void, key: string) => (
    <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white py-1 pl-3 pr-1.5 text-small text-ink">{label}{editable ? <button type="button" onClick={onRemove} aria-label="Remove from recall" className="grid size-6 place-items-center rounded-full text-quiet hover:bg-subtle hover:text-danger"><X aria-hidden className="size-3.5" /></button> : null}</li>
  );

  return (
    <div className="grid gap-5">
      {empty ? <p className="rounded-lg border border-dashed border-line-strong bg-cloud px-4 py-6 text-center text-small text-quiet">Nothing is covered yet. Choose a product, a batch, or specific serial numbers.</p> : (
        <div className="grid gap-4">
          {scope.products.length ? <div><p className="mb-2 text-caption font-semibold uppercase tracking-wider text-quiet">Whole products</p><ul className="flex flex-wrap gap-2">{scope.products.map((p) => chip(<>{p.name} <span className="text-serial text-quiet">{p.sku}</span></>, () => remove("product", p.id), p.id))}</ul></div> : null}
          {scope.batches.length ? <div><p className="mb-2 text-caption font-semibold uppercase tracking-wider text-quiet">Batches</p><ul className="flex flex-wrap gap-2">{scope.batches.map((b) => chip(<><span className="font-mono">{b.batch_code}</span> <span className="text-quiet">{b.product_name}</span></>, () => remove("batch", b.id), b.id))}</ul></div> : null}
          {scope.units.length ? <div><p className="mb-2 text-caption font-semibold uppercase tracking-wider text-quiet">Specific units{scope.units.length >= 200 ? " (first 200 shown)" : ""}</p><ul className="flex flex-wrap gap-2">{scope.units.map((u) => chip(<span className="text-serial">{u.serial_number}</span>, () => remove("unit", u.id), u.id))}</ul></div> : null}
        </div>
      )}
      {editable ? (
        <Tabs defaultValue="batch" className="rounded-xl border border-line bg-white p-4">
          <TabsList><TabsTrigger value="batch">A batch</TabsTrigger><TabsTrigger value="product">A whole product</TabsTrigger><TabsTrigger value="units">Specific serials</TabsTrigger></TabsList>
          <TabsContent value="batch" className="grid gap-3">
            <Select value={batch} onValueChange={setBatch}><SelectTrigger aria-label="Batch"><SelectValue placeholder="Choose a batch…" /></SelectTrigger><SelectContent>{choices.batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.batch_code} · {b.product_name}</SelectItem>)}</SelectContent></Select>
            <div><Button variant="secondary" disabled={!batch} loading={busy} onClick={() => add({ kind: "batch", batchId: batch }, () => setBatch(""))}><Plus aria-hidden />Add batch</Button></div>
          </TabsContent>
          <TabsContent value="product" className="grid gap-3">
            <Select value={product} onValueChange={setProduct}><SelectTrigger aria-label="Product"><SelectValue placeholder="Choose a product…" /></SelectTrigger><SelectContent>{choices.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku}</SelectItem>)}</SelectContent></Select>
            <p className="text-caption text-quiet">Covers every unit of this product, across all batches, including ones made later.</p>
            <div><Button variant="secondary" disabled={!product} loading={busy} onClick={() => add({ kind: "product", productId: product }, () => setProduct(""))}><Plus aria-hidden />Add product</Button></div>
          </TabsContent>
          <TabsContent value="units" className="grid gap-3">
            <Field label="Serial numbers" hint="Separated by spaces, commas or new lines."><Textarea value={serials} onChange={(e) => setSerials(e.target.value)} rows={4} className="font-mono text-small" placeholder="AXM-00000042&#10;AXM-00000043" /></Field>
            <div><Button variant="secondary" disabled={!serials.trim()} loading={busy} onClick={() => add({ kind: "units", serials }, () => setSerials(""))}><Plus aria-hidden />Add units</Button></div>
          </TabsContent>
        </Tabs>
      ) : null}
      {note ? <p role="status" className="text-small text-warning">{note}</p> : null}
    </div>
  );
}
