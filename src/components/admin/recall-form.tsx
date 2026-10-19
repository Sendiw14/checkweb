"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { createRecall, updateRecall } from "@/app/admin/recalls/actions";

type V = { title: string; reason: string; publicInstructions: string };

export function RecallForm({ mode, recallId, initial, status = "draft", canEdit = true }: { mode: "create" | "edit"; recallId?: string; initial?: V; status?: string; canEdit?: boolean }) {
  const router = useRouter();
  const [err, setErr] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, reset, watch, formState: { errors, isSubmitting, isDirty } } = useForm<V>({ defaultValues: initial ?? { title: "", reason: "", publicInstructions: "" } });
  const text = watch("publicInstructions");
  return (
    <form noValidate className="grid gap-5" onSubmit={handleSubmit(async (v) => {
      setErr(null);
      const res = mode === "create" ? await createRecall(v) : await updateRecall(recallId!, v);
      if (res.ok) { toast.success(mode === "create" ? "Draft recall created" : "Recall saved"); if (mode === "create" && "data" in res && res.data) router.push(`/admin/recalls/${res.data.id}`); else { reset(v); router.refresh(); } return; }
      setErr(res.error); for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f === "publicInstructions" ? "publicInstructions" : (f as keyof V), { message: m });
    })}>
      {err ? <Alert tone="danger" title="Not saved">{err}</Alert> : null}
      <Field label="Title" required error={errors.title?.message} hint="Customers see this heading on the result page."><Input {...register("title")} disabled={!canEdit} maxLength={160} /></Field>
      <Field label="Internal reason" required error={errors.reason?.message} hint="Why this recall exists. Staff only, never shown to customers."><Textarea {...register("reason")} disabled={!canEdit} rows={3} /></Field>
      <Field label="Customer instructions" error={errors.publicInstructions?.message} hint="Shown to customers exactly as written. Use only wording your quality and legal teams have approved. Never paste unreviewed text. This system doesn't write safety advice for you.">
        <Textarea {...register("publicInstructions")} disabled={!canEdit} rows={7} maxLength={4000} />
      </Field>
      {status === "active" ? <Alert tone="warning">This recall is live. Saving changes updates what customers see immediately, and counts as your approval of the new text.</Alert> : null}
      {text?.trim() ? (
        <div className="rounded-xl border border-line bg-cloud p-4">
          <p className="text-caption font-semibold uppercase tracking-wider text-quiet">How customers will see it</p>
          <article className="mt-3 rounded-xl border border-danger-line border-l-4 border-l-danger bg-white p-5">
            <p className="text-eyebrow !text-danger">Recall</p>
            <h3 className="mt-2 text-subheading">{watch("title") || "Recall title"}</h3>
            <p className="mt-3 whitespace-pre-line text-body">{text}</p>
          </article>
        </div>
      ) : null}
      {canEdit ? <div className="flex gap-3"><Button type="submit" loading={isSubmitting} disabled={mode === "edit" && !isDirty}><Save aria-hidden />{mode === "create" ? "Create draft" : "Save changes"}</Button></div> : null}
    </form>
  );
}
