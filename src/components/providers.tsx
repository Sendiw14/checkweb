"use client";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // reducedMotion="user": transform/layout animations are disabled when the OS asks for less motion.
    <MotionConfig reducedMotion="user">
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </MotionConfig>
  );
}
