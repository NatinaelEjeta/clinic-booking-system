import { Stethoscope } from "lucide-react";

/** Sticky footer — pinned to the viewport bottom on short pages. */
export function Footer({ timezone }: { timezone: string }) {
  const year = new Date().getFullYear();
  const tzLabel = timezone.replace(/_/g, " ");

  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <p className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Stethoscope className="h-3.5 w-3.5" aria-hidden />
          </span>
          © {year} CarePoint Clinic
        </p>
        <p className="text-center sm:text-right">
          Appointment scheduling for modern clinics · all times shown in {tzLabel}
        </p>
      </div>
    </footer>
  );
}
