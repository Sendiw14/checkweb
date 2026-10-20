"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useFieldProps } from "./field";

const control = [
  "app-control w-full rounded-md border border-input bg-surface px-3 text-[0.9375rem] text-ink",
  "placeholder:text-quiet",
  "transition-[border-color,box-shadow] duration-[var(--dur-fast)]",
  "hover:border-ink/60",
  "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/25",
  "aria-invalid:border-danger aria-invalid:ring-danger/15 aria-invalid:focus-visible:ring-danger/25",
  "disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-subtle disabled:text-quiet",
  "file:mr-3 file:border-0 file:bg-transparent file:text-small file:font-medium file:text-brand",
].join(" ");

export const controlClass = control;

export function Input({ className, type = "text", ...raw }: React.ComponentProps<"input">) {
  const props = useFieldProps(raw);
  return <input type={type} data-slot="input" className={cn(control, "h-10 pointer-coarse:h-11", className)} {...props} />;
}

export function Textarea({ className, ...raw }: React.ComponentProps<"textarea">) {
  const props = useFieldProps(raw);
  return <textarea data-slot="textarea" className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}
