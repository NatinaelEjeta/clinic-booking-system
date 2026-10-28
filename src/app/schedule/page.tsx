"use client";

/**
 * Doctor week calendar (STAFF only).
 * Week-at-a-glance view of the signed-in doctor's own appointments with
 * working-hours chips, time-off banners and visit outcome marking.
 * The API scopes every request to the doctor's own schedule.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarOff,
  CalendarX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { RequireRole } from "@/components/require-role";
import { useClinicTimezone } from "@/components/providers";
import { DayStrip } from "@/components/day-strip";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-auth";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";
import {
  addDaysToKey,
  dateKeyOf,
  formatDateTimeInTz,
  formatFullDayLabel,
  formatTimeInTz,
  minutesToHHMM,
  weekdayOfDateKey,
  zonedTimeToUtc,
} from "@/lib/time";
import type { AppointmentDTO, TimeOffDTO, WorkingHoursDTO } from "@/lib/types";

type OutcomeAction = "complete" | "no-show";

/** "26 – 31 Oct", "26 Oct – 1 Nov" or "29 Dec 2025 – 4 Jan 2026". */
function weekRangeLabel(fromKey: string, toKey: string): string {
  const from = new Date(`${fromKey}T12:00:00Z`);
  const to = new Date(`${toKey}T12:00:00Z`);
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const sameMonth = sameYear && from.getUTCMonth() === to.getUTCMonth();
  const dayFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
  });
  const dayMonthFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
  const fullFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const fromLabel = sameMonth
    ? dayFmt.format(from)
    : sameYear
      ? dayMonthFmt.format(from)
      : fullFmt.format(from);
  const toLabel = sameYear ? dayMonthFmt.format(to) : fullFmt.format(to);
  return `${fromLabel} – ${toLabel}`;
}

export default function SchedulePage() {
  return (
    <RequireRole roles={["STAFF"]}>
      <ScheduleContent />
    </RequireRole>
  );
}

function ScheduleContent() {
  const tz = useClinicTimezone();
  const { me } = useMe();
  const queryClient = useQueryClient();

  const [now] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  /** Explicitly picked day; null = auto (today when visible, else Monday). */
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const staffId = me?.staffId ?? null;
  const today = dateKeyOf(now, tz);

  const currentMonday = useMemo(
    () => addDaysToKey(today, -((weekdayOfDateKey(today) + 6) % 7)),
    [today],
  );
  const mondayKey = useMemo(
    () => addDaysToKey(currentMonday, weekOffset * 7),
    [currentMonday, weekOffset],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDaysToKey(mondayKey, index)),
    [mondayKey],
  );
  const sundayKey = weekDays[6] ?? mondayKey;

  // Derived selection: keep the pick only while it is inside the visible week.
  const selectedKey =
    pickedDay && weekDays.includes(pickedDay)
      ? pickedDay
      : weekDays.includes(today)
        ? today
        : mondayKey;

  const weekQuery = useQuery({
    queryKey: ["appointments", "week", mondayKey],
    queryFn: () =>
      api<{ appointments: AppointmentDTO[] }>(
        `/api/appointments?from=${mondayKey}&to=${sundayKey}`,
      ),
  });

  const hoursQuery = useQuery({
    queryKey: ["working-hours", staffId],
    queryFn: () =>
      api<{ hours: WorkingHoursDTO[] }>(`/api/staff/${staffId}/working-hours`),
    enabled: staffId !== null,
    staleTime: 5 * 60_000,
  });

  const timeOffQuery = useQuery({
    queryKey: ["time-off", staffId],
    queryFn: () => api<{ timeOff: TimeOffDTO[] }>(`/api/staff/${staffId}/time-off`),
    enabled: staffId !== null,
    staleTime: 60_000,
  });

  const outcomeMutation = useMutation({
    mutationFn: (input: { id: string; action: OutcomeAction }) =>
      api<{ appointment: AppointmentDTO }>(`/api/appointments/${input.id}`, {
        method: "PATCH",
        body: { action: input.action },
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["appointments", "week", mondayKey],
      });
      toast.success(
        variables.action === "complete"
          ? "Marked as completed"
          : "Marked as no-show",
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Could not update the appointment.",
      );
    },
  });

  // Group the week's appointments by clinic-local date key.
  const byDay: Record<string, AppointmentDTO[]> = {};
  for (const appointment of weekQuery.data?.appointments ?? []) {
    const key = dateKeyOf(new Date(appointment.startsAt), tz);
    (byDay[key] ??= []).push(appointment);
  }
  for (const list of Object.values(byDay)) {
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  const countBy: Record<string, number> = {};
  for (const day of weekDays) {
    countBy[day] = byDay[day]?.length ?? 0;
  }
  const weekTotal = weekQuery.data ? weekQuery.data.appointments.length : null;
  const todayCount = weekQuery.data ? (byDay[today]?.length ?? 0) : null;
  const dayAppointments = byDay[selectedKey] ?? [];

  // Working hours for the selected weekday.
  const selectedWeekday = weekdayOfDateKey(selectedKey);
  const dayHours = (hoursQuery.data?.hours ?? [])
    .filter((hours) => hours.weekday === selectedWeekday)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  // Time off overlapping the selected clinic-local day.
  const dayStart = zonedTimeToUtc(selectedKey, 0, tz);
  const dayEnd = zonedTimeToUtc(addDaysToKey(selectedKey, 1), 0, tz);
  const awayToday = (timeOffQuery.data?.timeOff ?? []).filter((interval) => {
    const start = new Date(interval.startsAt);
    const end = new Date(interval.endsAt);
    return start < dayEnd && dayStart < end;
  });

  function shiftWeek(delta: number) {
    setWeekOffset((offset) => offset + delta);
    // Weeks are disjoint, so the previous pick can never carry over —
    // clearing it lets the render derive Monday (or today) of the new week.
    setPickedDay(null);
  }

  function resetWeek() {
    setWeekOffset(0);
    setPickedDay(null);
  }

  function handleOutcome(appointment: AppointmentDTO, action: OutcomeAction) {
    outcomeMutation.mutate({ id: appointment.id, action });
  }

  if (me && staffId === null) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <ErrorBlock message="No doctor profile is linked to this account. Ask an administrator to link one." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          My schedule
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Appointments and availability in clinic time ({tz}).
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 tabular-nums">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            This week: {weekTotal ?? "—"} appointments
          </Badge>
          {weekDays.includes(today) && (
            <Badge variant="secondary" className="tabular-nums">
              Today: {todayCount ?? "—"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={resetWeek}>
              This week
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftWeek(-1)}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <p
            className="min-w-[9.5rem] text-center text-sm font-medium tabular-nums"
            aria-live="polite"
          >
            {weekRangeLabel(mondayKey, sundayKey)}
          </p>
          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftWeek(1)}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="mt-2">
        <DayStrip
          days={weekDays}
          selected={selectedKey}
          onSelect={setPickedDay}
          countBy={countBy}
          todayKey={today}
        />
      </div>

      <section className="mt-6" aria-label="Appointments for the selected day">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {formatFullDayLabel(selectedKey)}
          </h2>
          {hoursQuery.data ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              aria-label={`Working hours for ${formatFullDayLabel(selectedKey)}`}
            >
              <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {dayHours.length > 0 ? (
                dayHours.map((hours) => (
                  <span
                    key={hours.id}
                    className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums"
                  >
                    {minutesToHHMM(hours.startMinutes)} –{" "}
                    {minutesToHHMM(hours.endMinutes)}
                  </span>
                ))
              ) : (
                <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Day off
                </span>
              )}
            </div>
          ) : hoursQuery.isLoading ? (
            <Skeleton className="h-6 w-32 rounded-full" />
          ) : null}
        </div>

        {awayToday.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {awayToday.map((interval) => (
              <Alert
                key={interval.id}
                className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              >
                <CalendarOff className="h-4 w-4" aria-hidden />
                <AlertTitle>Away — {interval.reason}</AlertTitle>
                <AlertDescription className="text-amber-800 dark:text-amber-300">
                  {formatDateTimeInTz(new Date(interval.startsAt), tz)} →{" "}
                  {formatDateTimeInTz(new Date(interval.endsAt), tz)}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {weekQuery.isLoading ? (
            <div className="flex flex-col gap-3" aria-busy="true" role="status" aria-label="Loading appointments">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : weekQuery.isError ? (
            <ErrorBlock
              message={
                weekQuery.error instanceof ApiClientError
                  ? weekQuery.error.message
                  : "Could not load your schedule."
              }
              onRetry={() => void weekQuery.refetch()}
            />
          ) : dayAppointments.length === 0 ? (
            <EmptyBlock
              title="No appointments on this day."
              description="When patients book a visit with you, it will appear here."
              icon={CalendarX}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {dayAppointments.map((appointment) => {
                const pending =
                  outcomeMutation.isPending &&
                  outcomeMutation.variables?.id === appointment.id
                    ? outcomeMutation.variables.action
                    : null;
                return (
                  <li key={appointment.id}>
                    <AppointmentRow
                      appointment={appointment}
                      tz={tz}
                      now={now}
                      pending={pending}
                      onOutcome={handleOutcome}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function AppointmentRow({
  appointment,
  tz,
  now,
  pending,
  onOutcome,
}: {
  appointment: AppointmentDTO;
  tz: string;
  now: Date;
  pending: OutcomeAction | null;
  onOutcome: (appointment: AppointmentDTO, action: OutcomeAction) => void;
}) {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  const started = start.getTime() <= now.getTime();
  const isBooked = appointment.status === "BOOKED";
  const notes = appointment.notes.trim();

  return (
    <Card className="gap-0 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="shrink-0 text-sm font-semibold tabular-nums sm:w-28 sm:pt-0.5">
          {formatTimeInTz(start, tz)}
          <span className="font-normal text-muted-foreground"> – </span>
          {formatTimeInTz(end, tz)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold sm:text-base">
            {appointment.customer?.name ?? "—"}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {appointment.service.name} ·{" "}
            {formatDuration(appointment.service.durationMinutes)}
          </p>
          {notes && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {notes}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <StatusBadge status={appointment.status} />
          {isBooked && started ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending !== null}
                onClick={() => onOutcome(appointment, "complete")}
                className="gap-1.5"
              >
                {pending === "complete" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                )}
                Completed
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending !== null}
                onClick={() => onOutcome(appointment, "no-show")}
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/50"
              >
                {pending === "no-show" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <XCircle className="h-3.5 w-3.5" aria-hidden />
                )}
                No-show
              </Button>
            </div>
          ) : isBooked ? (
            <p className="text-xs text-muted-foreground">
              starts {formatTimeInTz(start, tz)}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
