"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRestoreFocus } from "./restore-focus";

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

const sides = {
  left: "inset-y-0 left-0 h-dvh w-[min(20rem,calc(100vw-2.5rem))] data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left border-r",
  right: "inset-y-0 right-0 h-dvh w-[min(26rem,calc(100vw-2.5rem))] data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right border-l",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom border-t pb-[max(1rem,var(--safe-bottom))]",
} as const;

export function SheetContent({ side = "right", className, children, title, description, onOpenAutoFocus, onCloseAutoFocus, ...props }: React.ComponentProps<typeof D.Content> & { side?: keyof typeof sides; title: string; description?: string }) {
  const rf = useRestoreFocus();
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <D.Content
        className={cn(
          "app-sheet-panel fixed z-[var(--z-modal)] flex flex-col overflow-y-auto border-line bg-surface shadow-pop duration-[var(--dur-base)] ease-[var(--ease-out)] data-[state=open]:animate-in data-[state=closed]:animate-out",
          sides[side], className,
        )}
        {...props}
        onOpenAutoFocus={(e) => { rf.onOpenAutoFocus(); onOpenAutoFocus?.(e); }}
        onCloseAutoFocus={(e) => { onCloseAutoFocus?.(e); if (!e.defaultPrevented) rf.onCloseAutoFocus(e); }}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <D.Title className="sr-only">{title}</D.Title>
        {description ? <D.Description className="sr-only">{description}</D.Description> : null}
        {children}
        <D.Close aria-label="Close" className="absolute right-3 top-3 grid size-10 place-items-center rounded-md text-quiet hover:bg-subtle hover:text-ink">
          <X aria-hidden className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
