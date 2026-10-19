"use client";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      richColors={false}
      gap={10}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-line !bg-surface !text-ink !shadow-pop !font-sans !text-sm",
          description: "!text-quiet",
          success: "!border-success-line",
          error: "!border-danger-line",
        },
      }}
    />
  );
}
