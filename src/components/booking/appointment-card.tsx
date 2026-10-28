"use client";

/**
 * Single appointment card for the customer /appointments page.
 *
 * Upcoming cards expose two actions, both guarded by the server-provided
 * canCancel / canReschedule flags (the 24-hour change window):
 *  - Reschedule: a Dialog with a 14-day DayStrip + live slot grid for the
 *    same service and doctor, then PATCH { action: "reschedule", startsAt }.
 *  - Cancel: an AlertDialog confirm, then PATCH { action: "cancel" }.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  CalendarCheck2,
  CalendarClock,
  CalendarOff,
  Clock,
  Loader2,
  Quote,
  XCircle,
} from "lucide-react";
import { useClinicTimezone } from "@/components/providers";
import { DayStrip } from "@/components/day-strip";
import { SlotPicker } from "@/components/slot-picker";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDuration, formatPrice } from "@/lib/format";
import {
  addDaysToKey,
  formatDateInTz,
  formatDateTimeInTz,
  formatFullDayLabel,
  formatTimeInTz,
  todayKey,
} from "@/lib/time";
import type { AppointmentDTO, SlotDTO, SlotsResponse } from "@/lib/types";

/** The next 14 clinic-local date keys starting today. */
function nextFourteenDays(timezone: string): string[] {
  const first = todayKey(timezone);
  return Array.from({ length: 14 }, (_, index) => addDaysToKey(first, index));
}

export function AppointmentCard({
  appointment,
  showActions,
}: {
  appointment: AppointmentDTO;
  /** Render cancel/reschedule actions (upcoming BOOKED appointments only). */
  showActions: boolean;
}) {
  const tz = useClinicTimezone();
  const queryClient = useQueryClient();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [dateKey, setDateKey] = useState(() => todayKey(tz));
  const [selectedSlot, setSelectedSlot] = useState<SlotDTO | null>(null);

  const start = new Date(appointment.startsAt);
  const days = useMemo(() => nextFourteenDays(tz), [tz]);

  /* ------------------------------------------------------------- cancel -- */

  const cancelMutation = useMutation({
    mutationFn: () =>
      api<{ appointment: AppointmentDTO }>(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        body: { action: "cancel" },
      }),
    onSuccess: () => {
      setCancelOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
      toast.success("Appointment cancelled");
    },
    onError: (error) => {
      setCancelOpen(false);
      toast.error(
        error instanceof Error ? error.message : "Could not cancel the appointment.",
      );
    },
  });

  /* -------------------------------------------------------- reschedule -- */

  const slotsQuery = useQuery({
    queryKey: ["slots", appointment.service.id, appointment.staff.id, dateKey],
    queryFn: () => {
      const params = new URLSearchParams({
        serviceId: appointment.service.id,
        staffId: appointment.staff.id,
        date: dateKey,
      });
      return api<SlotsResponse>(`/api/slots?${params.toString()}`);
    },
    enabled: rescheduleOpen,
  });
  const slots = slotsQuery.data?.slots ?? [];

  const rescheduleMutation = useMutation({
    mutationFn: (startsAt: string) =>
      api<{ appointment: AppointmentDTO }>(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        body: { action: "reschedule", startsAt },
      }),
    onSuccess: () => {
      setRescheduleOpen(false);
      setSelectedSlot(null);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
      toast.success("Appointment rescheduled");
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        // Slot taken / overlap — surface the message and refresh availability.
        toast.error(error.message);
        setSelectedSlot(null);
        void slotsQuery.refetch();
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not reschedule the appointment.",
        );
      }
    },
  });

  function openReschedule() {
    setDateKey(todayKey(tz));
    setSelectedSlot(null);
    setRescheduleOpen(true);
  }

  function handleSelectDay(key: string) {
    if (key === dateKey) return;
    setDateKey(key);
    setSelectedSlot(null);
  }

  /* ---------------------------------------------------------------- card -- */

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        {/* Time column */}
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 border-b pb-4 sm:w-36 sm:flex-col sm:items-start sm:justify-start sm:gap-1 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {formatDateInTz(start, tz)}
            </p>
            <p className="text-xl font-bold tabular-nums sm:text-2xl">
              {formatTimeInTz(start, tz)}
            </p>
          </div>
          <Badge variant="secondary" className="gap-1 font-normal tabular-nums">
            <Clock className="h-3 w-3" aria-hidden />
            {formatDuration(appointment.service.durationMinutes)}
          </Badge>
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold leading-snug">{appointment.service.name}</h3>
            <StatusBadge status={appointment.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            with {appointment.staff.name} · {appointment.staff.specialty}
          </p>
          <p className="text-sm font-medium">{formatPrice(appointment.service.price)}</p>

          {appointment.notes && (
            <p className="mt-1 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="italic">{appointment.notes}</span>
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {appointment.reminderSentAt && (
              <span className="flex items-center gap-1">
                <Bell className="h-3.5 w-3.5" aria-hidden />
                Reminder sent
              </span>
            )}
            <span>Booked {formatDateInTz(new Date(appointment.createdAt), tz)}</span>
          </div>

          {showActions && (
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={openReschedule}
                  disabled={!appointment.canReschedule}
                >
                  <CalendarClock className="h-4 w-4" aria-hidden />
                  Reschedule
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setCancelOpen(true)}
                  disabled={!appointment.canCancel}
                >
                  <XCircle className="h-4 w-4" aria-hidden />
                  Cancel
                </Button>
              </div>
              {(!appointment.canCancel || !appointment.canReschedule) && (
                <p className="text-xs text-muted-foreground">
                  Changes close 24 hours before the appointment starts.
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>

      {/* -------------------------------------------------- cancel dialog -- */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              {appointment.service.name} with {appointment.staff.name} on{" "}
              {formatDateTimeInTz(start, tz)} will be cancelled. This cannot be
              undone, but you can always book a new appointment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              Keep appointment
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending}
              className="gap-2 bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                // Keep the dialog open while the request runs.
                event.preventDefault();
                cancelMutation.mutate();
              }}
            >
              {cancelMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------------------------------------------- reschedule dialog -- */}
      <Dialog
        open={rescheduleOpen}
        onOpenChange={(open) => {
          setRescheduleOpen(open);
          if (!open) setSelectedSlot(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reschedule {appointment.service.name}</DialogTitle>
            <DialogDescription>
              Currently {formatDateTimeInTz(start, tz)} with {appointment.staff.name}.
              Pick a new day and time below.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <DayStrip
              days={days}
              selected={dateKey}
              onSelect={handleSelectDay}
              todayKey={days[0]}
            />

            {slotsQuery.isLoading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {Array.from({ length: 12 }, (_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : slotsQuery.isError ? (
              <ErrorBlock
                message="Could not load the available times."
                onRetry={() => slotsQuery.refetch()}
              />
            ) : slots.length === 0 ? (
              <EmptyBlock
                icon={CalendarOff}
                title="No open slots on this day"
                description={`${appointment.staff.name} is fully booked — try another day from the strip above.`}
              />
            ) : (
              <SlotPicker
                slots={slots}
                selectedStartsAt={selectedSlot?.startsAt ?? null}
                onSelect={setSelectedSlot}
              />
            )}

            <p className="text-xs text-muted-foreground">
              Times are shown in clinic local time ({tz}).
            </p>

            {selectedSlot && (
              <p
                className="rounded-lg border bg-accent/60 px-3 py-2 text-sm"
                aria-live="polite"
              >
                New time:{" "}
                <span className="font-medium">{formatFullDayLabel(dateKey)}</span> at{" "}
                <span className="font-medium tabular-nums">{selectedSlot.startTime}</span>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRescheduleOpen(false)}
              disabled={rescheduleMutation.isPending}
            >
              Close
            </Button>
            <Button
              type="button"
              className="gap-2"
              onClick={() => {
                if (selectedSlot) rescheduleMutation.mutate(selectedSlot.startsAt);
              }}
              disabled={!selectedSlot || rescheduleMutation.isPending}
            >
              {rescheduleMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CalendarCheck2 className="h-4 w-4" aria-hidden />
              )}
              Confirm new time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
