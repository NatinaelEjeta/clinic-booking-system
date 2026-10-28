"use client";

/**
 * Admin console — Hours & time off tab: doctor selector, weekly working-hours
 * template editor (up to three windows per weekday) and the time-off list.
 * All wall-clock values are interpreted in the clinic timezone.
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useClinicTimezone } from "@/components/providers";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { api } from "@/lib/api-client";
import { WEEKDAY_NAMES } from "@/lib/constants";
import {
  formatDateTimeInTz,
  hhmmToMinutes,
  minutesToHHMM,
  zonedTimeToUtc,
} from "@/lib/time";
import type { StaffDTO, TimeOffDTO, WorkingHoursDTO } from "@/lib/types";

const MAX_WINDOWS_PER_DAY = 3;

interface WindowDraft {
  start: string;
  end: string;
}

interface DayDraft {
  enabled: boolean;
  windows: WindowDraft[];
}

/** Build the editable week state from the server rows. */
function draftFromHours(hours: WorkingHoursDTO[]): DayDraft[] {
  return WEEKDAY_NAMES.map((_, weekday) => {
    const windows = hours
      .filter((entry) => entry.weekday === weekday)
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map((entry) => ({
        start: minutesToHHMM(entry.startMinutes),
        end: minutesToHHMM(entry.endMinutes),
      }));
    return { enabled: windows.length > 0, windows };
  });
}

/** First validation problem of a day, or null when the day is valid. */
function dayError(day: DayDraft): string | null {
  if (!day.enabled) return null;
  const parsed: Array<{ start: number; end: number }> = [];
  for (const item of day.windows) {
    if (!item.start || !item.end) {
      return "Enter both a start and an end time.";
    }
    const start = hhmmToMinutes(item.start);
    const end = hhmmToMinutes(item.end);
    if (start === null || end === null) {
      return "Times must be valid HH:MM values.";
    }
    if (start >= end) {
      return "Windows must end after they start.";
    }
    parsed.push({ start, end });
  }
  parsed.sort((a, b) => a.start - b.start);
  for (let index = 1; index < parsed.length; index++) {
    if (parsed[index].start < parsed[index - 1].end) {
      return "Windows overlap — merge or adjust them.";
    }
  }
  return null;
}

/** Convert the week state to the PUT payload, or null when invalid. */
function buildHoursPayload(
  days: DayDraft[],
): Array<{
  weekday: number;
  startMinutes: number;
  endMinutes: number;
}> | null {
  const payload: Array<{
    weekday: number;
    startMinutes: number;
    endMinutes: number;
  }> = [];
  for (let weekday = 0; weekday < days.length; weekday++) {
    const day = days[weekday];
    if (!day.enabled) continue;
    for (const item of day.windows) {
      const start = hhmmToMinutes(item.start);
      const end = hhmmToMinutes(item.end);
      if (start === null || end === null || start >= end) return null;
      payload.push({ weekday, startMinutes: start, endMinutes: end });
    }
  }
  return payload;
}

/**
 * Weekly template editor. Mounted with a `key={staffId}` and initialized from
 * the server rows via a useState initializer — no effects needed.
 */
function HoursEditor({
  staffId,
  initialHours,
}: {
  staffId: string;
  initialHours: WorkingHoursDTO[];
}) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<DayDraft[]>(() => draftFromHours(initialHours));

  const errors = days.map((day) => dayError(day));
  const hasErrors = errors.some((message) => message !== null);
  const payload = hasErrors ? null : buildHoursPayload(days);

  const saveMutation = useMutation({
    mutationFn: (
      hours: Array<{
        weekday: number;
        startMinutes: number;
        endMinutes: number;
      }>,
    ) =>
      api<{ hours: WorkingHoursDTO[] }>(`/api/staff/${staffId}/working-hours`, {
        method: "PUT",
        body: { hours },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["working-hours", staffId] });
      toast.success("Working hours saved");
    },
    onError: (error) => toast.error(error.message),
  });

  function setDay(weekday: number, updater: (day: DayDraft) => DayDraft) {
    setDays((previous) =>
      previous.map((day, index) => (index === weekday ? updater(day) : day)),
    );
  }

  function toggleDay(weekday: number, enabled: boolean) {
    setDay(weekday, (day) => ({
      ...day,
      enabled,
      windows:
        enabled && day.windows.length === 0
          ? [{ start: "09:00", end: "17:00" }]
          : day.windows,
    }));
  }

  function addWindow(weekday: number) {
    setDay(weekday, (day) =>
      day.windows.length >= MAX_WINDOWS_PER_DAY
        ? day
        : { ...day, windows: [...day.windows, { start: "09:00", end: "17:00" }] },
    );
  }

  function removeWindow(weekday: number, windowIndex: number) {
    setDay(weekday, (day) => ({
      ...day,
      windows: day.windows.filter((_, index) => index !== windowIndex),
    }));
  }

  function updateWindow(
    weekday: number,
    windowIndex: number,
    field: "start" | "end",
    value: string,
  ) {
    setDay(weekday, (day) => ({
      ...day,
      windows: day.windows.map((item, index) =>
        index === windowIndex ? { ...item, [field]: value } : item,
      ),
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((day, weekday) => (
        <div
          key={WEEKDAY_NAMES[weekday]}
          className="rounded-lg border p-3 sm:p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Switch
                checked={day.enabled}
                onCheckedChange={(checked) => toggleDay(weekday, checked)}
                aria-label={
                  day.enabled
                    ? `Close ${WEEKDAY_NAMES[weekday]}`
                    : `Open ${WEEKDAY_NAMES[weekday]}`
                }
              />
              <span className="text-sm font-medium">
                {WEEKDAY_NAMES[weekday]}
              </span>
            </div>
            {day.enabled && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => addWindow(weekday)}
                disabled={day.windows.length >= MAX_WINDOWS_PER_DAY}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add window
              </Button>
            )}
          </div>

          {day.enabled ? (
            <div className="mt-3 flex flex-col gap-2">
              {day.windows.map((item, windowIndex) => (
                <div
                  key={windowIndex}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Input
                    type="time"
                    value={item.start}
                    onChange={(event) =>
                      updateWindow(weekday, windowIndex, "start", event.target.value)
                    }
                    aria-label={`${WEEKDAY_NAMES[weekday]} window ${windowIndex + 1} start time`}
                    className="w-32"
                  />
                  <span className="text-muted-foreground" aria-hidden>
                    –
                  </span>
                  <Input
                    type="time"
                    value={item.end}
                    onChange={(event) =>
                      updateWindow(weekday, windowIndex, "end", event.target.value)
                    }
                    aria-label={`${WEEKDAY_NAMES[weekday]} window ${windowIndex + 1} end time`}
                    className="w-32"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeWindow(weekday, windowIndex)}
                    aria-label={`Remove window ${windowIndex + 1} on ${WEEKDAY_NAMES[weekday]}`}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              {errors[weekday] && (
                <p className="text-xs text-destructive">{errors[weekday]}</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Closed</p>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Up to {MAX_WINDOWS_PER_DAY} windows per day. Saving replaces the whole
          weekly template.
        </p>
        <Button
          size="sm"
          className="gap-2"
          disabled={payload === null || saveMutation.isPending}
          onClick={() => {
            if (payload) saveMutation.mutate(payload);
          }}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save working hours
        </Button>
      </div>
    </div>
  );
}

/** Time off: add form + existing entries for one doctor. */
function TimeOffSection({ staffId }: { staffId: string }) {
  const tz = useClinicTimezone();
  const queryClient = useQueryClient();

  const timeOffQuery = useQuery({
    queryKey: ["time-off", staffId],
    queryFn: () =>
      api<{ timeOff: TimeOffDTO[] }>(`/api/staff/${staffId}/time-off`),
  });

  const [startValue, setStartValue] = useState("");
  const [endValue, setEndValue] = useState("");
  const [reason, setReason] = useState("");

  /** "YYYY-MM-DDTHH:mm" (clinic-local) -> UTC instant, or null. */
  function localToInstant(value: string): Date | null {
    if (value.length < 16) return null;
    const minutes = hhmmToMinutes(value.slice(11));
    if (minutes === null) return null;
    return zonedTimeToUtc(value.slice(0, 10), minutes, tz);
  }

  const startInstant = localToInstant(startValue);
  const endInstant = localToInstant(endValue);
  const rangeValid =
    startInstant !== null &&
    endInstant !== null &&
    startInstant.getTime() < endInstant.getTime();

  const addMutation = useMutation({
    mutationFn: (body: { startsAt: string; endsAt: string; reason: string }) =>
      api<{ timeOff: TimeOffDTO }>(`/api/staff/${staffId}/time-off`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off", staffId] });
      toast.success("Time off added");
      setStartValue("");
      setEndValue("");
      setReason("");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/time-off/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off", staffId] });
      toast.success("Time off removed");
    },
    onError: (error) => toast.error(error.message),
  });

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!rangeValid || addMutation.isPending || startInstant === null || endInstant === null) {
      return;
    }
    addMutation.mutate({
      startsAt: startInstant.toISOString(),
      endsAt: endInstant.toISOString(),
      reason: reason.trim(),
    });
  }

  const entries = [...(timeOffQuery.data?.timeOff ?? [])].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const nowMs = Date.now();

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">Time off</h2>
          <p className="text-sm text-muted-foreground">
            Vacations, holidays and training days — patients cannot book during
            time off.
          </p>
        </div>

        {timeOffQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : timeOffQuery.isError ? (
          <ErrorBlock
            message="Could not load time off. Please try again."
            onRetry={() => timeOffQuery.refetch()}
          />
        ) : (
          <>
            <form className="flex flex-col gap-4" onSubmit={handleAdd}>
              <p className="text-sm text-muted-foreground">
                Times are interpreted as clinic local time ({tz}).
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="timeoff-start">Start</Label>
                  <Input
                    id="timeoff-start"
                    type="datetime-local"
                    value={startValue}
                    onChange={(event) => setStartValue(event.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="timeoff-end">End</Label>
                  <Input
                    id="timeoff-end"
                    type="datetime-local"
                    value={endValue}
                    onChange={(event) => setEndValue(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="timeoff-reason">Reason (optional)</Label>
                <Input
                  id="timeoff-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={200}
                  placeholder="e.g. Annual leave"
                />
              </div>
              {startValue !== "" && endValue !== "" && !rangeValid && (
                <p className="text-sm text-destructive">
                  The end must be after the start.
                </p>
              )}
              <div>
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={!rangeValid || addMutation.isPending}
                >
                  {addMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  )}
                  Add time off
                </Button>
              </div>
            </form>

            {entries.length === 0 ? (
              <EmptyBlock
                title="No time off recorded"
                description="Blocked periods appear here once you add them."
                icon={CalendarX2}
              />
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <ul className="flex flex-col gap-2">
                  {entries.map((entry) => {
                    const isPast = new Date(entry.endsAt).getTime() < nowMs;
                    return (
                      <li
                        key={entry.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 ${
                          isPast ? "opacity-60" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {formatDateTimeInTz(new Date(entry.startsAt), tz)} →{" "}
                            {formatDateTimeInTz(new Date(entry.endsAt), tz)}
                          </p>
                          {entry.reason !== "" && (
                            <p className="truncate text-sm text-muted-foreground">
                              {entry.reason}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => deleteMutation.mutate(entry.id)}
                          disabled={
                            deleteMutation.isPending &&
                            deleteMutation.variables === entry.id
                          }
                          aria-label={`Remove time off from ${formatDateTimeInTz(
                            new Date(entry.startsAt),
                            tz,
                          )}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Remove
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function HoursTab() {
  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => api<{ staff: StaffDTO[] }>("/api/staff"),
  });

  // Explicit selection wins; otherwise default to the first doctor during
  // render — no state or effect needed for the default.
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const doctors = staffQuery.data?.staff ?? [];
  const staffId = selectedDoctorId ?? doctors[0]?.id ?? null;

  const hoursQuery = useQuery({
    queryKey: ["working-hours", staffId],
    queryFn: () =>
      api<{ hours: WorkingHoursDTO[] }>(`/api/staff/${staffId}/working-hours`),
    enabled: staffId !== null,
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Working hours</h2>
            <p className="text-sm text-muted-foreground">
              The weekly template patients can book against.
            </p>
          </div>

          {staffQuery.isLoading ? (
            <Skeleton className="h-12 w-full max-w-72" />
          ) : staffQuery.isError ? (
            <ErrorBlock
              message="Could not load doctors. Please try again."
              onRetry={() => staffQuery.refetch()}
            />
          ) : doctors.length === 0 ? (
            <EmptyBlock
              title="No doctors yet"
              description="Add a doctor in the Doctors tab first, then manage their schedule here."
            />
          ) : (
            staffId && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="hours-doctor">Doctor</Label>
                  <Select
                    value={staffId}
                    onValueChange={setSelectedDoctorId}
                  >
                    <SelectTrigger
                      id="hours-doctor"
                      className="w-full sm:w-72"
                    >
                      <SelectValue placeholder="Select a doctor" />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map((doctor) => (
                        <SelectItem key={doctor.id} value={doctor.id}>
                          {doctor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {hoursQuery.isLoading ? (
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: 7 }).map((_, index) => (
                      <Skeleton key={index} className="h-20 w-full rounded-lg" />
                    ))}
                  </div>
                ) : hoursQuery.isError ? (
                  <ErrorBlock
                    message="Could not load working hours. Please try again."
                    onRetry={() => hoursQuery.refetch()}
                  />
                ) : (
                  <HoursEditor
                    key={staffId}
                    staffId={staffId}
                    initialHours={hoursQuery.data?.hours ?? []}
                  />
                )}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {staffId ? <TimeOffSection staffId={staffId} /> : null}
    </div>
  );
}
