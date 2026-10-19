import Image from "next/image";
import { PartPlaceholder } from "@/components/brand/part-placeholder";
import { cn } from "@/lib/utils";

/** Real product photo when available, otherwise the line-drawing placeholder. Dimensions are fixed to avoid layout shift. */
export function ProductImage({ src, alt, className, priority = false }: { src?: string | null; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden bg-cloud", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 480px, 100vw" priority={priority} className="object-contain p-4" />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <PartPlaceholder className="max-h-full max-w-full" label="No photo available for this product" />
        </div>
      )}
    </div>
  );
}
