"use client";
import * as React from "react";
import { Accordion as A } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Accordion = A.Root;
export function AccordionItem({ className, ...props }: React.ComponentProps<typeof A.Item>) {
  return <A.Item className={cn("border-b border-line first:border-t", className)} {...props} />;
}
export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof A.Trigger>) {
  return (
    <A.Header className="flex">
      <A.Trigger
        className={cn(
          "group flex flex-1 items-start justify-between gap-6 py-5 text-left text-subheading transition-colors hover:text-brand pointer-coarse:py-6",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown aria-hidden className="mt-1 size-5 shrink-0 text-quiet transition-transform duration-[var(--dur-base)] group-data-[state=open]:rotate-180" />
      </A.Trigger>
    </A.Header>
  );
}
export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof A.Content>) {
  return (
    <A.Content className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" {...props}>
      <div className={cn("max-w-prose pb-5 pr-10 text-body", className)}>{children}</div>
    </A.Content>
  );
}
