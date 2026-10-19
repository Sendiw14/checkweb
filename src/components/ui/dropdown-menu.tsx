"use client";
import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Non-modal on purpose: this is the WAI-ARIA "menu button" pattern, where Tab closes the menu. A modal
 * menu would mark the rest of the page aria-hidden while leaving focusable items inside it.
 */
export function DropdownMenu(props: React.ComponentProps<typeof M.Root>) {
  return <M.Root modal={false} {...props} />;
}
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;

export function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        className={cn(
          "z-[var(--z-modal)] min-w-48 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-pop",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-[var(--dur-fast)]",
          className,
        )}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({ className, tone, inset, ...props }: React.ComponentProps<typeof M.Item> & { tone?: "danger"; inset?: boolean }) {
  return (
    <M.Item
      className={cn(
        "relative flex min-h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-small text-body outline-none transition-colors",
        "data-[highlighted]:bg-subtle data-[highlighted]:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-45 pointer-coarse:min-h-11 [&_svg]:size-4 [&_svg]:text-quiet",
        tone === "danger" && "text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger [&_svg]:text-danger",
        inset && "pl-8", className,
      )}
      {...props}
    />
  );
}
export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 py-1.5 text-caption font-semibold text-quiet", className)} {...props} />;
}
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}
