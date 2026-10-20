"use client";
import * as React from "react";
import { AlertDialog as AD, Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import { Field } from "./field";
import { useRestoreFocus } from "./restore-focus";

const overlay = "fixed inset-0 z-[var(--z-overlay)] bg-ink/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-[var(--dur-base)]";
const panel = [
  "fixed left-1/2 top-1/2 z-[var(--z-modal)] grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4",
  "max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-pop sm:p-6",
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2",
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-[var(--dur-base)]",
].join(" ");

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, hideClose, onOpenAutoFocus, onCloseAutoFocus, ...props }: React.ComponentProps<typeof D.Content> & { title: React.ReactNode; description?: React.ReactNode; hideClose?: boolean }) {
  const rf = useRestoreFocus();
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(panel, className)}
        {...props}
        onOpenAutoFocus={(e) => { rf.onOpenAutoFocus(); onOpenAutoFocus?.(e); }}
        onCloseAutoFocus={(e) => { onCloseAutoFocus?.(e); if (!e.defaultPrevented) rf.onCloseAutoFocus(e); }}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <div className="space-y-1.5 pr-8">
          <D.Title className="text-heading">{title}</D.Title>
          {description ? <D.Description className="text-small text-quiet">{description}</D.Description> : null}
        </div>
        {children}
        {hideClose ? null : (
          <D.Close aria-label="Close dialog" className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-quiet transition-colors hover:bg-subtle hover:text-ink">
            <X aria-hidden className="size-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

/**
 * Confirmation for consequential actions. `requireText` forces the person to type a
 * phrase (e.g. "RECALL") so a stray click cannot trigger a high-impact operation.
 */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, cancelLabel = "Cancel", tone = "primary", requireText, onConfirm, children,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description: React.ReactNode; confirmLabel: string; cancelLabel?: string;
  tone?: "primary" | "danger"; requireText?: string; onConfirm: () => Promise<void> | void; children?: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const blocked = !!requireText && typed.trim() !== requireText;
  const rf = useRestoreFocus();

  return (
    <AD.Root open={open} onOpenChange={(v) => { if (busy) return; if (!v) setTyped(""); onOpenChange(v); }}>
      <AD.Portal>
        <AD.Overlay className={overlay} />
        <AD.Content className={panel} onOpenAutoFocus={rf.onOpenAutoFocus} onCloseAutoFocus={rf.onCloseAutoFocus}>
          <div className="space-y-1.5">
            <AD.Title className="text-heading">{title}</AD.Title>
            <AD.Description asChild><div className="text-small text-body">{description}</div></AD.Description>
          </div>
          {children}
          {requireText ? (
            <Field label={<>Type <span className="font-mono text-ink">{requireText}</span> to confirm</>}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            </Field>
          ) : null}
          <DialogFooter>
            <AD.Cancel asChild><Button variant="secondary" disabled={busy}>{cancelLabel}</Button></AD.Cancel>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={busy}
              disabled={blocked}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try { await onConfirm(); onOpenChange(false); } finally { setBusy(false); }
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
