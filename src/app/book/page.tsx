"use client";

/**
 * Customer booking flow — a 4-step wizard:
 * service → doctor → date & time → confirm.
 *
 * All wizard state lives in this component. The REST API stays authoritative
 * for availability: slots are keyed by [serviceId, doctorChoice, dateKey] and
 * refetched (invalidated) whenever the server reports a 409 conflict.
 */

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CalendarOff,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import { RequireRole } from "@/components/require-role";
import { useClinicTimezone } from "@/components/providers";
import { DayStrip } from "@/components/day-strip";
import { SlotPicker } from "@/components/slot-picker";
import { EmptyBlock, ErrorBlock } from "@/components/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDuration, formatPrice } from "@/lib/format";
import {
  addDaysToKey,
  formatDateTimeInTz,
  formatFullDayLabel,
  todayKey,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import type {
  AppointmentDTO,
  ServiceDTO,
  SlotDTO,
  SlotsResponse,
  StaffDTO,
} from "@/lib/types";

const STEPS = [
  { id: 1, label: "Service" },
  { id: 2, label: "Doctor" },
  { id: 3, label: "Date & time" },
  { id: 4, label: "Confirm" },
] as const;

const STEP_META: Record<number, { title: string; description: string }> = {
  1: {
    title: "Choose a service",
    description: "What do you need help with today?",
  },
  2: {
    title: "Choose a doctor",
    description: "Pick a specific doctor or go with the first available.",
  },
  3: {
    title: "Pick a date and time",
    description: "Browse the next two weeks of live availability.",
  },
  4: {
    title: "Review and confirm",
    description: "Double-check the details, add notes, and lock in your slot.",
  },
};

/** "Dr. Sara Tesfaye" -> "ST" (matches the avatar initials on the home page). */
function initialsOf(name: string): string {
  return name
    .replace("Dr. ", "")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function StepIndicator({
  current,
  onGoTo,
}: {
  current: number;
  onGoTo: (step: number) => void;
}) {
  return (
    <nav aria-label="Booking progress">
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((step, index) => {
          const isDone = step.id < current;
          const isCurrent = step.id === current;
          const connectorReached = step.id <= current;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              {index > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 min-w-2 flex-1 rounded-full",
                    connectorReached ? "bg-primary/40" : "bg-border",
                  )}
                />
              )}
              <button
                type="button"
                disabled={!isDone}
                onClick={() => onGoTo(step.id)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isDone ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span className="sr-only">{`Step ${step.id} of 4: ${step.label}`}</span>
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    isCurrent
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : isDone
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    step.id
                  )}
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium sm:inline",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function BookPage() {
  const tz = useClinicTimezone();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  /** "any" (first available), a staff id, or null while unselected. */
  const [doctorChoice, setDoctorChoice] = useState<string | null>(null);
  const [dateKey, setDateKey] = useState(() => todayKey(tz));
  const [selectedSlot, setSelectedSlot] = useState<SlotDTO | null>(null);
  /** In any-doctor mode: the doctor resolved from the picked slot. */
  const [resolvedStaffId, setResolvedStaffId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState<AppointmentDTO | null>(null);

  /* ------------------------------------------------------------- catalog -- */

  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: () => api<{ services: ServiceDTO[] }>("/api/services"),
  });
  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => api<{ staff: StaffDTO[] }>("/api/staff"),
  });

  const services = servicesQuery.data?.services ?? [];
  const doctors = staffQuery.data?.staff ?? [];
  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  const offeringDoctors = useMemo(
    () =>
      doctors.filter(
        (doctor) => serviceId !== null && doctor.services.some((s) => s.id === serviceId),
      ),
    [doctors, serviceId],
  );

  const days = useMemo(() => {
    const first = todayKey(tz);
    return Array.from({ length: 14 }, (_, index) => addDaysToKey(first, index));
  }, [tz]);

  /* --------------------------------------------------------------- slots -- */

  const isAnyDoctor = doctorChoice === "any";
  const bookedStaffId =
    doctorChoice && doctorChoice !== "any" ? doctorChoice : resolvedStaffId;
  const bookedDoctor = doctors.find((doctor) => doctor.id === bookedStaffId) ?? null;
  const chosenDoctor = doctors.find((doctor) => doctor.id === doctorChoice) ?? null;

  const slotsQuery = useQuery({
    queryKey: ["slots", serviceId ?? "none", doctorChoice ?? "any", dateKey],
    queryFn: () => {
      const params = new URLSearchParams({
        serviceId: serviceId ?? "",
        date: dateKey,
      });
      if (doctorChoice && doctorChoice !== "any") {
        params.set("staffId", doctorChoice);
      }
      return api<SlotsResponse>(`/api/slots?${params.toString()}`);
    },
    enabled: serviceId !== null && step >= 3,
  });
  const slots = slotsQuery.data?.slots ?? [];

  /* -------------------------------------------------------------- booking -- */

  const bookMutation = useMutation({
    mutationFn: (input: {
      serviceId: string;
      staffId: string;
      startsAt: string;
      notes: string;
    }) =>
      api<{ appointment: AppointmentDTO }>("/api/appointments", {
        method: "POST",
        body: input,
      }),
    onSuccess: (data) => {
      setConfirmed(data.appointment);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 409) {
        // Slot just taken or overlaps another appointment — send the customer
        // back to step 3 with fresh availability.
        toast.error(error.message);
        void queryClient.invalidateQueries({ queryKey: ["slots"] });
        setSelectedSlot(null);
        setResolvedStaffId(null);
        setStep(3);
      } else {
        toast.error(
          error instanceof Error ? error.message : "Booking failed. Please try again.",
        );
      }
    },
  });

  /* --------------------------------------------------------- interactions -- */

  function handleSelectService(service: ServiceDTO) {
    if (service.id === serviceId) return;
    setServiceId(service.id);
    // A different service invalidates every downstream choice.
    setDoctorChoice(null);
    setSelectedSlot(null);
    setResolvedStaffId(null);
  }

  function handleSelectDoctor(choice: string) {
    if (choice === doctorChoice) return;
    setDoctorChoice(choice);
    setSelectedSlot(null);
    setResolvedStaffId(null);
  }

  function handleSelectDay(key: string) {
    if (key === dateKey) return;
    setDateKey(key);
    setSelectedSlot(null);
    setResolvedStaffId(null);
  }

  function handleSelectSlot(slot: SlotDTO) {
    setSelectedSlot(slot);
    if (isAnyDoctor) {
      setResolvedStaffId(slot.staffIds?.[0] ?? null);
    }
  }

  function handleConfirm() {
    if (!serviceId || !bookedStaffId || !selectedSlot) return;
    bookMutation.mutate({
      serviceId,
      staffId: bookedStaffId,
      startsAt: selectedSlot.startsAt,
      notes: notes.trim(),
    });
  }

  function resetWizard() {
    setStep(1);
    setServiceId(null);
    setDoctorChoice(null);
    setDateKey(todayKey(tz));
    setSelectedSlot(null);
    setResolvedStaffId(null);
    setNotes("");
    setConfirmed(null);
  }

  const canContinue =
    (step === 1 && serviceId !== null) ||
    (step === 2 && doctorChoice !== null) ||
    (step === 3 && selectedSlot !== null && bookedStaffId !== null);
  const canConfirm = Boolean(serviceId && bookedStaffId && selectedSlot);

  /* ------------------------------------------------------------ step bodies */

  let stepBody: ReactNode;

  if (step === 1) {
    stepBody = servicesQuery.isLoading ? (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
    ) : servicesQuery.isError ? (
      <ErrorBlock
        message="Could not load services. Please try again."
        onRetry={() => servicesQuery.refetch()}
      />
    ) : services.length === 0 ? (
      <EmptyBlock
        title="No services available"
        description="The clinic has not published any bookable services yet — please check back soon."
      />
    ) : (
      <div
        role="radiogroup"
        aria-label="Choose a service"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {services.map((service) => {
          const isSelected = service.id === serviceId;
          return (
            <button
              key={service.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelectService(service)}
              className={cn(
                "flex h-full flex-col gap-3 rounded-xl border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isSelected
                  ? "border-primary bg-accent shadow-sm"
                  : "bg-card hover:border-primary/50 hover:bg-accent/50",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold leading-snug">{service.name}</span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </span>
              <span className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-4 w-4" aria-hidden />
                  {formatDuration(service.durationMinutes)}
                </span>
                <span className="font-semibold text-primary">
                  {formatPrice(service.price)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  } else if (step === 2) {
    stepBody = staffQuery.isLoading ? (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
    ) : staffQuery.isError ? (
      <ErrorBlock
        message="Could not load the doctors directory."
        onRetry={() => staffQuery.refetch()}
      />
    ) : (
      <div
        role="radiogroup"
        aria-label="Choose a doctor"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <button
          type="button"
          role="radio"
          aria-checked={doctorChoice === "any"}
          onClick={() => handleSelectDoctor("any")}
          className={cn(
            "flex h-full flex-col items-start gap-3 rounded-xl border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            doctorChoice === "any"
              ? "border-primary bg-accent shadow-sm"
              : "bg-card hover:border-primary/50 hover:bg-accent/50",
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <span className="font-semibold leading-snug">First available doctor</span>
          <span className="mt-auto text-sm text-muted-foreground">
            We’ll match you with the first doctor free at your chosen time.
          </span>
        </button>

        {offeringDoctors.map((doctor) => {
          const isSelected = doctor.id === doctorChoice;
          return (
            <button
              key={doctor.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelectDoctor(doctor.id)}
              className={cn(
                "flex h-full flex-col items-start gap-3 rounded-xl border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isSelected
                  ? "border-primary bg-accent shadow-sm"
                  : "bg-card hover:border-primary/50 hover:bg-accent/50",
              )}
            >
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {initialsOf(doctor.name)}
                </AvatarFallback>
              </Avatar>
              <span className="font-semibold leading-snug">{doctor.name}</span>
              <span className="mt-auto text-sm text-muted-foreground">
                {doctor.specialty}
              </span>
            </button>
          );
        })}

        {!staffQuery.isLoading &&
          !staffQuery.isError &&
          offeringDoctors.length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              No doctor lists this service right now — you can still continue with
              the first available option.
            </p>
          )}
      </div>
    );
  } else if (step === 3) {
    stepBody = (
      <div className="flex flex-col gap-5">
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
            description={
              isAnyDoctor
                ? "No doctor is free on this day — try another day from the strip above."
                : `${chosenDoctor?.name ?? "This doctor"} is fully booked — try another day from the strip above.`
            }
          />
        ) : (
          <SlotPicker
            slots={slots}
            selectedStartsAt={selectedSlot?.startsAt ?? null}
            onSelect={handleSelectSlot}
            showDoctors={isAnyDoctor}
          />
        )}

        {isAnyDoctor && selectedSlot && bookedDoctor && (
          <p className="flex items-center gap-2 rounded-lg border bg-accent/60 px-3 py-2 text-sm">
            <Stethoscope className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              Your appointment will be with{" "}
              <span className="font-medium">{bookedDoctor.name}</span> —{" "}
              {bookedDoctor.specialty}.
            </span>
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Times are shown in clinic local time ({tz}).
        </p>
      </div>
    );
  } else {
    stepBody = (
      <div className="flex flex-col gap-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-xl border bg-muted/30 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Service
            </dt>
            <dd className="font-semibold">{selectedService?.name}</dd>
            <dd className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden />
                {selectedService ? formatDuration(selectedService.durationMinutes) : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <Wallet className="h-4 w-4" aria-hidden />
                {selectedService ? formatPrice(selectedService.price) : ""}
              </span>
            </dd>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border bg-muted/30 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Doctor
            </dt>
            <dd className="font-semibold">{bookedDoctor?.name}</dd>
            <dd className="text-sm text-muted-foreground">{bookedDoctor?.specialty}</dd>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border bg-muted/30 p-4 sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              When
            </dt>
            <dd className="font-semibold">
              {selectedSlot
                ? `${formatFullDayLabel(dateKey)} at ${selectedSlot.startTime}`
                : ""}
            </dd>
            <dd className="text-sm text-muted-foreground">
              Clinic local time ({tz})
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2">
          <Label htmlFor="booking-notes">Notes for the doctor</Label>
          <Textarea
            id="booking-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything the doctor should know? (optional)"
            maxLength={500}
            rows={4}
            className="resize-none"
          />
          <p className="text-right text-xs text-muted-foreground" aria-live="polite">
            {notes.length}/500
          </p>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------------- view -- */

  return (
    <RequireRole roles={["CUSTOMER"]}>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Book an appointment
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a service, pick your doctor and lock in a time — it takes under
            a minute.
          </p>
        </header>

        {confirmed ? (
          <Card className="border-primary/30">
            <CardContent className="flex flex-col items-center gap-5 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden />
              </span>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Appointment confirmed
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We’ve saved your slot — see you at the clinic.
                </p>
              </div>
              <Separator className="w-full" />
              <dl className="grid w-full gap-3 text-left text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Service</dt>
                  <dd className="font-medium">{confirmed.service.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Doctor</dt>
                  <dd className="font-medium">{confirmed.staff.name}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">When</dt>
                  <dd className="font-medium">
                    {formatDateTimeInTz(new Date(confirmed.startsAt), tz)}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild className="gap-2">
                  <Link href="/appointments">
                    <CalendarCheck2 className="h-4 w-4" aria-hidden />
                    View my appointments
                  </Link>
                </Button>
                <Button type="button" variant="outline" onClick={resetWizard}>
                  Book another appointment
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            <StepIndicator current={step} onGoTo={setStep} />

            <Card>
              <CardHeader>
                <CardTitle>{STEP_META[step].title}</CardTitle>
                <CardDescription>{STEP_META[step].description}</CardDescription>
              </CardHeader>
              <CardContent>{stepBody}</CardContent>
              <CardFooter className="gap-3 border-t">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(step - 1)}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Back
                  </Button>
                )}
                {step < 4 ? (
                  <Button
                    type="button"
                    onClick={() => setStep(step + 1)}
                    disabled={!canContinue}
                    className="ml-auto gap-2"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!canConfirm || bookMutation.isPending}
                    className="ml-auto gap-2"
                  >
                    {bookMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <CalendarCheck2 className="h-4 w-4" aria-hidden />
                    )}
                    Confirm booking
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </RequireRole>
  );
}
