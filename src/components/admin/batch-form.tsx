"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { batchSchema, type BatchInput } from "@/lib/schemas/batch";
import { createBatch } from "@/app/admin/batches/actions";
import { formatNumber } from "@/lib/utils";

export function BatchForm({ products, defaultProduct }: { products: { id: string; sku: string; name: string }[]; defaultProduct?: string }) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const { register, control, handleSubmit, setError, watch, formState: { errors, isSubmitting } } = useForm<BatchInput>({
    resolver: zodResolver(batchSchema),
    defaultValues: { productId: products.some((p) => p.id === defaultProduct) ? defaultProduct : "", batchCode: "", manufacturingDate: today, expectedQuantity: 1000, registerNow: true, notes: "" },
  });
  const qty = Number(watch("expectedQuantity"));
  const registerNow = watch("registerNow");

  return (
    <form
      noValidate className="grid gap-5"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        const res = await createBatch(values);
        if (res.ok && res.data) {
          toast.success(res.data.registered ? `Batch created with ${formatNumber(res.data.registered)} units` : "Batch created");
          router.push(`/admin/batches/${res.data.id}`);
          return;
        }
        if (!res.ok) { setFormError(res.error); for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof BatchInput, { message: m }); }
      })}
    >
      {formError ? <Alert tone="danger" title="Not saved">{formError}</Alert> : null}
      <Field label="Product" required error={errors.productId?.message}>
        <Controller control={control} name="productId" render={({ field }) => (
          <Select value={field.value || undefined} onValueChange={field.onChange}>
            <SelectTrigger><SelectValue placeholder="Choose a product" /></SelectTrigger>
            <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku}</SelectItem>)}</SelectContent>
          </Select>
        )} />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <Field label="Batch code" required error={errors.batchCode?.message} hint="Your production lot or batch identifier. Must be unique."><Input {...register("batchCode")} className="text-serial uppercase" autoCapitalize="characters" spellCheck={false} /></Field>
        <Field label="Manufacturing date" required error={errors.manufacturingDate?.message}><Input {...register("manufacturingDate")} type="date" max={today} /></Field>
      </div>
      <Field label="Expected quantity" required error={errors.expectedQuantity?.message} hint="How many units this batch will contain. Units can be registered all at once or in stages.">
        <Input {...register("expectedQuantity")} type="number" inputMode="numeric" min={1} max={1000000} className="sm:max-w-48" />
      </Field>
      <div className="flex items-start gap-3 rounded-lg border border-line bg-cloud p-4">
        <Controller control={control} name="registerNow" render={({ field }) => <Checkbox id="register-now" checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />} />
        <label htmlFor="register-now" className="text-small">
          <span className="font-semibold text-ink">Register all {Number.isFinite(qty) && qty > 0 ? formatNumber(qty) : ""} units now</span>
          <span className="mt-0.5 block text-quiet">Creates one record with its own serial number per unit. No codes or labels are issued yet: that's a separate, controlled step.</span>
        </label>
      </div>
      <Field label="Notes" optionalLabel error={errors.notes?.message}><Textarea {...register("notes")} rows={3} /></Field>
      <div><Button type="submit" loading={isSubmitting}><Boxes aria-hidden />{registerNow ? "Create batch and register units" : "Create batch"}</Button></div>
    </form>
  );
}
