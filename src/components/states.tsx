"use client";

/** Shared loading / empty / error blocks used across all pages. */

import { AlertTriangle, Inbox, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-3 py-10 text-muted-foreground"
      role="status"
      aria-label={label}
    >
      <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorBlock({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-10 text-center"
      role="alert"
    >
      <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
      <p className="max-w-md px-4 text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RotateCw className="h-4 w-4" aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyBlock({
  title,
  description,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  icon?: typeof Inbox;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-sm px-6 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
