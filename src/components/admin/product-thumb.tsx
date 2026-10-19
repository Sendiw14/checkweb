import Image from "next/image";
import { PartPlaceholder } from "@/components/brand/part-placeholder";
import { cn } from "@/lib/utils";

/** Compact, fixed-size thumbnail so rows never jump as images load. */
export function ProductThumb({ src, alt = "", className }: { src: string | null; alt?: string; className?: string }) {
  return (
    <div className={cn("relative size-10 shrink-0 overflow-hidden rounded-md border border-line bg-cloud", className)}>
      {src ? <Image src={src} alt={alt} fill sizes="64px" className="object-contain p-0.5" /> : <PartPlaceholder label="" className="size-full" />}
    </div>
  );
}
