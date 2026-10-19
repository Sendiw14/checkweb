"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { setProductActive } from "@/app/admin/products/actions";

export function ProductStatusControl({ productId, active, name }: { productId: string; active: boolean; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={active ? "danger-soft" : "secondary"} onClick={() => setOpen(true)}>{active ? <Ban aria-hidden /> : <RotateCcw aria-hidden />}{active ? "Deactivate product" : "Reactivate product"}</Button>
      <ConfirmDialog
        open={open} onOpenChange={setOpen} tone={active ? "danger" : "primary"}
        title={active ? `Deactivate ${name}?` : `Reactivate ${name}?`}
        description={active ? "No new batches can be registered for an inactive product. Existing batches, units and labels are not affected and customers can still verify them." : "New batches can be registered for this product again."}
        confirmLabel={active ? "Deactivate" : "Reactivate"}
        onConfirm={async () => { const r = await setProductActive(productId, !active); if (r.ok) { toast.success(active ? "Product deactivated" : "Product reactivated"); router.refresh(); } else { toast.error(r.error); throw new Error(r.error); } }}
      />
    </>
  );
}
