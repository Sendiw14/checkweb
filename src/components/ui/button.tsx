import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand text-white shadow-xs hover:bg-brand-deep active:bg-brand-deep",
        secondary: "border border-line-strong bg-surface text-ink shadow-xs hover:border-input hover:bg-cloud",
        soft: "bg-brand-soft text-brand hover:bg-[#dbe8fd]",
        ghost: "text-body hover:bg-subtle hover:text-ink",
        danger: "bg-danger text-white shadow-xs hover:bg-[#912018]",
        "danger-soft": "border border-danger-line bg-danger-soft text-danger hover:bg-[#fee4e2]",
        link: "h-auto rounded-sm p-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[0.8125rem] pointer-coarse:min-h-11",
        md: "h-10 px-4 text-[0.875rem] pointer-coarse:min-h-11",
        lg: "h-12 px-6 text-[0.9375rem]",
        "icon-sm": "size-8 pointer-coarse:size-11",
        icon: "size-10 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Brief confirmation state, shown after a successful action. */
  success?: boolean;
}

export function Button({ className, variant, size, asChild = false, loading = false, success = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...(asChild ? {} : { type: props.type ?? "button" })}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner /> : success ? <Check aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}
