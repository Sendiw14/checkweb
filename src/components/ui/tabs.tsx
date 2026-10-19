"use client";
import * as React from "react";
import { Tabs as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "relative -mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-small font-medium text-quiet transition-colors",
        "hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink pointer-coarse:py-3",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = ({ className, ...props }: React.ComponentProps<typeof T.Content>) => <T.Content className={cn("pt-5 outline-none", className)} {...props} />;
