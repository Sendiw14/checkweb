"use client";
import { useEffect } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { /* the server has already logged this with a digest; nothing sensitive is sent anywhere else */ }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        tone="danger" icon={<CircleAlert />} title="This page couldn't load"
        description={<>Nothing was changed. This is usually temporary, so try again. If it keeps happening, tell an administrator{error.digest ? <> and quote <span className="font-mono text-ink">{error.digest}</span></> : null}.</>}
        action={<Button onClick={reset}><RefreshCw aria-hidden />Try again</Button>}
      />
    </div>
  );
}
