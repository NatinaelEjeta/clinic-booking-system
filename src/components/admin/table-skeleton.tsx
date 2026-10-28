"use client";

/**
 * Admin console — shared skeleton placeholder for tab tables
 * (services, appointments) while their queries load.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function TableSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-2 rounded-xl border p-4", className)}
      role="status"
      aria-label="Loading table"
    >
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
