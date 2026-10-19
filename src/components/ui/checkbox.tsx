"use client";
import * as React from "react";
import { Checkbox as C, Switch as Sw } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldProps } from "./field";

export function Checkbox({ className, ...raw }: React.ComponentProps<typeof C.Root>) {
  const props = useFieldProps(raw as React.ComponentProps<"button">) as React.ComponentProps<typeof C.Root>;
  return (
    <C.Root
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[5px] border border-input bg-surface text-white transition-colors",
        "hover:border-ink/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand",
        "pointer-coarse:size-6", className,
      )}
      {...props}
    >
      <C.Indicator>
        {props.checked === "indeterminate" ? <Minus aria-hidden className="size-3.5" /> : <Check aria-hidden className="size-3.5" strokeWidth={3} />}
      </C.Indicator>
    </C.Root>
  );
}

export function Switch({ className, ...raw }: React.ComponentProps<typeof Sw.Root>) {
  const props = useFieldProps(raw as React.ComponentProps<"button">) as React.ComponentProps<typeof Sw.Root>;
  return (
    <Sw.Root
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent bg-input/70 p-0.5 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand",
        className,
      )}
      {...props}
    >
      <Sw.Thumb className="block size-5 rounded-full bg-white shadow-sm transition-transform duration-[var(--dur-fast)] data-[state=checked]:translate-x-5" />
    </Sw.Root>
  );
}
