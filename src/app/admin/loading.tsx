import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading" className="animate-in fade-in-0 duration-300">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-9 w-72" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="mt-6 h-96" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
