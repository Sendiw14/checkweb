"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ProductImage } from "@/components/public/product-image";
import { removeProductImage, uploadProductImage } from "@/app/admin/products/actions";

const MAX = 5 * 1024 * 1024;

export function ProductImageCard({ productId, imageUrl, name, canWrite }: { productId: string; imageUrl: string | null; name: string; canWrite: boolean }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX) { setError("That image is larger than 5 MB. Resize it and try again."); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Only JPEG, PNG or WebP photos can be used."); return; }
    setBusy(true);
    const fd = new FormData();
    fd.set("image", file);
    const res = await uploadProductImage(productId, fd);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (res.ok) { toast.success("Photo updated"); router.refresh(); } else setError(res.error);
  }

  return (
    <div>
      <ProductImage src={imageUrl} alt={`Photo of ${name}`} className="aspect-square w-full rounded-lg border border-line" />
      {error ? <Alert tone="danger" className="mt-3">{error}</Alert> : null}
      {canWrite ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="product-image-input" aria-label="Choose a product photo (JPEG, PNG or WebP)" tabIndex={-1} onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="secondary" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>{imageUrl ? <Upload aria-hidden /> : <ImagePlus aria-hidden />}{imageUrl ? "Replace photo" : "Add photo"}</Button>
          {imageUrl ? <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} disabled={busy}><Trash2 aria-hidden />Remove</Button> : null}
        </div>
      ) : null}
      <p className="mt-2 text-caption text-quiet">JPEG, PNG or WebP, up to 5 MB. Shown to customers on the result page.</p>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Remove this photo?" description="Customers will see a placeholder illustration until you add a new photo." confirmLabel="Remove photo" tone="danger"
        onConfirm={async () => { const r = await removeProductImage(productId); if (r.ok) { toast.success("Photo removed"); router.refresh(); } else toast.error(r.error); }} />
    </div>
  );
}
