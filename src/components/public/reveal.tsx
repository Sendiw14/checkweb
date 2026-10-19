import * as React from "react";
import { cn } from "@/lib/utils";

/** CSS scroll-reveal (see globals.css). Content is visible by default; animation is progressive enhancement. */
export function Reveal({ children, className, index = 0 }: { children: React.ReactNode; className?: string; index?: number }) {
  return <div className={cn("reveal", className)} style={{ ["--i" as string]: index }}>{children}</div>;
}

export function RevealList({ children, className, as: Tag = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "ol" | "ul" }) {
  return <Tag className={className}>{children}</Tag>;
}

export function RevealItem({ children, className, as: Tag = "div", index = 0 }: { children: React.ReactNode; className?: string; as?: "div" | "li"; index?: number }) {
  return <Tag className={cn("reveal", className)} style={{ ["--i" as string]: index }}>{children}</Tag>;
}
