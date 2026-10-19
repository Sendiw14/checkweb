"use client";
import { useRouter } from "next/navigation";
import { ManualCodeForm } from "@/components/public/manual-code-form";

/** Quick manual entry on the landing page. The code travels in the URL *fragment* (never sent to a server) and is stripped on arrival. */
export function HeroCodeEntry() {
  const router = useRouter();
  return (
    <ManualCodeForm
      label="Have a code instead of a QR scan?"
      hint="It's the 20 letters and numbers printed under the QR code."
      submitLabel="Check code"
      inputId="hero-code"
      onSubmitCode={(c) => router.push(`/verify#${encodeURIComponent(c)}`)}
    />
  );
}
