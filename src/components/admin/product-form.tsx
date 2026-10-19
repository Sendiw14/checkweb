"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { productSchema, type ProductInput } from "@/lib/schemas/product";
import { createProduct, updateProduct } from "@/app/admin/products/actions";

export function ProductForm({ mode, productId, initial, canWrite = true }: { mode: "create" | "edit"; productId?: string; initial?: ProductInput; canWrite?: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting, isDirty } } = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: initial ?? { sku: "", partNumber: "", name: "", brand: "", category: "", description: "" },
  });

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        const res = mode === "create" ? await createProduct(values) : await updateProduct(productId!, values);
        if (res.ok) {
          toast.success(mode === "create" ? "Product created" : "Changes saved");
          if (mode === "create" && "data" in res && res.data) router.push(`/admin/products/${res.data.id}`);
          else { reset(values); router.refresh(); }
          return;
        }
        setFormError(res.error);
        for (const [f, m] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof ProductInput, { message: m });
      })}
    >
      {formError ? <Alert tone="danger" title="Not saved">{formError}</Alert> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <Field label="SKU" required error={errors.sku?.message} hint="Your internal stock code. Stored in capitals.">
          <Input {...register("sku")} disabled={!canWrite} className="text-serial uppercase" autoCapitalize="characters" spellCheck={false} />
        </Field>
        <Field label="Part number" required error={errors.partNumber?.message} hint="The number printed on labels and catalogues.">
          <Input {...register("partNumber")} disabled={!canWrite} className="text-serial uppercase" autoCapitalize="characters" spellCheck={false} />
        </Field>
      </div>
      <Field label="Product name" required error={errors.name?.message}><Input {...register("name")} disabled={!canWrite} maxLength={160} /></Field>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <Field label="Brand" optionalLabel error={errors.brand?.message}><Input {...register("brand")} disabled={!canWrite} /></Field>
        <Field label="Category" optionalLabel error={errors.category?.message}><Input {...register("category")} disabled={!canWrite} placeholder="e.g. Brakes" /></Field>
      </div>
      <Field label="Description" optionalLabel error={errors.description?.message} hint="Shown to staff only. Customers see the name, part number and photo.">
        <Textarea {...register("description")} disabled={!canWrite} rows={4} />
      </Field>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={isSubmitting} disabled={mode === "edit" && !isDirty}><Save aria-hidden />{mode === "create" ? "Create product" : "Save changes"}</Button>
          {mode === "edit" && isDirty ? <Button type="button" variant="ghost" onClick={() => reset()}>Discard changes</Button> : null}
        </div>
      ) : null}
    </form>
  );
}
