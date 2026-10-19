"use client";
import * as React from "react";
import { Select as S } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "./input";
import { useFieldProps } from "./field";

export const Select = S.Root;
export const SelectValue = S.Value;

export function SelectTrigger({ className, children, ...raw }: React.ComponentProps<typeof S.Trigger>) {
  const props = useFieldProps(raw as React.ComponentProps<"button">) as React.ComponentProps<typeof S.Trigger>;
  return (
    <S.Trigger className={cn(controlClass, "inline-flex h-10 items-center justify-between gap-2 text-left data-[placeholder]:text-quiet pointer-coarse:h-11 [&>span]:truncate", className)} {...props}>
      {children}
      <S.Icon asChild><ChevronDown aria-hidden className="size-4 shrink-0 text-quiet" /></S.Icon>
    </S.Trigger>
  );
}

export function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof S.Content>) {
  return (
    <S.Portal>
      <S.Content
        position={position}
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          "relative z-[var(--z-modal)] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface shadow-pop",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-[var(--dur-fast)]",
          className,
        )}
        {...props}
      >
        <S.Viewport className="p-1">{children}</S.Viewport>
      </S.Content>
    </S.Portal>
  );
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof S.Item>) {
  return (
    <S.Item
      className={cn(
        "relative flex min-h-9 cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-3 text-small text-body outline-none",
        "data-[highlighted]:bg-subtle data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-45 pointer-coarse:min-h-11",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 grid size-4 place-items-center">
        <S.ItemIndicator><Check aria-hidden className="size-4 text-brand" /></S.ItemIndicator>
      </span>
      <S.ItemText>{children}</S.ItemText>
    </S.Item>
  );
}
