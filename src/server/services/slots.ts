/**
 * Slot generation and scheduling rules — THE pure scheduling brain.
 *
 * This module is intentionally 100% pure: no database, no env access, no
 * clock reads. Everything (working hours, time off, appointments, "now") is
 * passed in, which makes the rules trivially unit-testable (see
 * slots.test.ts) and lets the booking API re-run the EXACT same logic inside
 * a database transaction before inserting (double-booking protection).
 *
 * TIME MODEL
 *   * Working hours are per weekday, in "minutes since clinic-local
 *     midnight" (e.g. 09:30 = 570), for the clinic timezone.
 *   * Time off and appointments are UTC instants (Date / ISO).
 *   * A candidate slot [start, start + duration) is OPEN iff:
 *       1. it starts at least `minNoticeMinutes` (default 60) in the future,
 *       2. it fits entirely inside ONE working window of that weekday,
 *       3. it does not overlap any time off interval,
 *       4. it does not overlap any non-cancelled appointment.
 *
 * OVERLAP RULE: two intervals overlap iff a.start < b.end AND b.start < a.end
 * — touching endpoints (back-to-back appointments) do NOT overlap.
 */

import {
  CANCEL_WINDOW_HOURS,
  MIN_NOTICE_MINUTES,
  SLOT_STEP_MINUTES,
} from "@/lib/constants";
import {
  getZonedParts,
  minutesToHHMM,
  weekdayOfDateKey,
  zonedTimeToUtc,
} from "@/lib/time";

/** A UTC time interval [start, end). */
export interface TimeInterval {
  start: Date;
  end: Date;
}

/** A weekly working window, e.g. { weekday: 1, startMinutes: 540, endMinutes: 720 }. */
export interface WorkingWindow {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
}

/** Everything needed to evaluate or generate slots for one clinic-local day. */
export interface SlotContext {
  /** Clinic IANA timezone (e.g. "Africa/Addis_Ababa"). */
  timeZone: string;
  /** Clinic-local date key ("YYYY-MM-DD") the slots belong to. */
  dateKey: string;
  /** Duration of the bookable service in minutes. */
  durationMinutes: number;
  /** The doctor's working windows for the weekday of `dateKey`. */
  workingWindows: WorkingWindow[];
  /** The doctor's time off (UTC), overlapping the day or not — extra is fine. */
  timeOff: TimeInterval[];
  /** The doctor's existing non-cancelled appointments (UTC). */
  appointments: TimeInterval[];
  /** Injected "now" so tests are deterministic. */
  now: Date;
  /** Candidate grid in minutes (default SLOT_STEP_MINUTES = 15). */
  stepMinutes?: number;
  /** Booking lead time in minutes (default MIN_NOTICE_MINUTES = 60). */
  minNoticeMinutes?: number;
}

export interface Slot {
  /** UTC start instant. */
  startsAt: Date;
  /** UTC end instant (startsAt + duration). */
  endsAt: Date;
  /** Minutes since clinic-local midnight. */
  startMinutes: number;
  /** Clinic-local "HH:mm" label. */
  startTime: string;
}

export type SlotRejection =
  | "outside-working-hours"
  | "during-time-off"
  | "conflict"
  | "too-soon";

export type SlotEvaluation = { ok: true } | { ok: false; reason: SlotRejection };

/** True iff [a.start, a.end) and [b.start, b.end) share at least one instant. */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedDateKeyOf(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * Evaluate a single candidate slot against every rule.
 * Both the public slot browser and the booking transaction call this, so
 * what the customer sees is EXACTLY what the transaction enforces.
 */
export function evaluateSlot(ctx: SlotContext, startsAt: Date): SlotEvaluation {
  const minNoticeMinutes = ctx.minNoticeMinutes ?? MIN_NOTICE_MINUTES;
  const endsAt = new Date(startsAt.getTime() + ctx.durationMinutes * 60_000);
  const interval: TimeInterval = { start: startsAt, end: endsAt };

  // Rule 1 — minimum notice: the slot must be far enough in the future.
  if (startsAt.getTime() - ctx.now.getTime() < minNoticeMinutes * 60_000) {
    return { ok: false, reason: "too-soon" };
  }

  // Rule 2 — the whole slot must sit inside ONE working window of that day.
  const startParts = getZonedParts(startsAt, ctx.timeZone);
  if (zonedDateKeyOf(startsAt, ctx.timeZone) !== ctx.dateKey) {
    // The instant is not on the requested clinic-local day at all.
    return { ok: false, reason: "outside-working-hours" };
  }
  // Compute the end in clinic-local minutes too (DST-safe: if the end falls
  // on another local day, it can never be inside a same-day window).
  const endKey = zonedDateKeyOf(endsAt, ctx.timeZone);
  const endMinutes =
    endKey === ctx.dateKey ? getZonedParts(endsAt, ctx.timeZone).minutes : Number.POSITIVE_INFINITY;
  const insideWindow = ctx.workingWindows.some(
    (w) =>
      w.weekday === startParts.weekday &&
      w.startMinutes <= startParts.minutes &&
      endMinutes <= w.endMinutes,
  );
  if (!insideWindow) {
    return { ok: false, reason: "outside-working-hours" };
  }

  // Rule 3 — no overlap with time off (holidays, leave).
  if (ctx.timeOff.some((t) => intervalsOverlap(t, interval))) {
    return { ok: false, reason: "during-time-off" };
  }

  // Rule 4 — no overlap with any existing appointment (double-booking guard).
  if (ctx.appointments.some((a) => intervalsOverlap(a, interval))) {
    return { ok: false, reason: "conflict" };
  }

  return { ok: true };
}

/**
 * Generate every open slot for the day described by `ctx`.
 * Candidate starts walk each working window on the `stepMinutes` grid and are
 * then run through `evaluateSlot`, so generation and evaluation can never
 * disagree. Duplicate UTC instants are de-duplicated (can only happen on DST
 * transition days where two wall-clock times map to the same instant).
 */
export function generateSlots(ctx: SlotContext): Slot[] {
  const step = ctx.stepMinutes ?? SLOT_STEP_MINUTES;
  const weekday = weekdayOfDateKey(ctx.dateKey);
  const windows = ctx.workingWindows
    .filter((w) => w.weekday === weekday)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const slots: Slot[] = [];
  const seenInstants = new Set<number>();

  for (const window of windows) {
    for (
      let startMinutes = window.startMinutes;
      startMinutes + ctx.durationMinutes <= window.endMinutes;
      startMinutes += step
    ) {
      const startsAt = zonedTimeToUtc(ctx.dateKey, startMinutes, ctx.timeZone);
      const key = startsAt.getTime();
      if (seenInstants.has(key)) continue;

      const evaluation = evaluateSlot(ctx, startsAt);
      if (!evaluation.ok) continue;

      seenInstants.add(key);
      slots.push({
        startsAt,
        endsAt: new Date(key + ctx.durationMinutes * 60_000),
        startMinutes,
        startTime: minutesToHHMM(startMinutes),
      });
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/* ---------------------------------------------------------------------------
 * Cancellation / reschedule window
 * ------------------------------------------------------------------------- */

/**
 * Customers may cancel or reschedule only more than `windowHours` (default
 * 24) before the appointment starts. Returns a human-readable violation
 * message, or null when the change is still allowed.
 */
export function cancellationWindowViolation(
  now: Date,
  startsAt: Date,
  windowHours: number = CANCEL_WINDOW_HOURS,
): string | null {
  const msLeft = startsAt.getTime() - now.getTime();
  if (msLeft <= windowHours * 3_600_000) {
    return `Appointments can only be changed more than ${windowHours} hours before the start time. Contact the clinic for urgent changes.`;
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Rejection -> API error mapping (used by the appointment service)
 * ------------------------------------------------------------------------- */

export const SLOT_REJECTION_MESSAGES: Record<SlotRejection, string> = {
  "outside-working-hours": "The doctor is not working at that time.",
  "during-time-off": "The doctor is away (time off) at that time.",
  conflict: "That slot was just taken. Please choose another time.",
  "too-soon": `Appointments must be booked at least ${MIN_NOTICE_MINUTES} minutes in advance.`,
};

/** HTTP status for each rejection — a live conflict is 409, bad input is 400. */
export const SLOT_REJECTION_STATUS: Record<SlotRejection, 400 | 409> = {
  "outside-working-hours": 400,
  "during-time-off": 400,
  conflict: 409,
  "too-soon": 400,
};
