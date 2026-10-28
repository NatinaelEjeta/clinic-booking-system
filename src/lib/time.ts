/**
 * Pure timezone helpers built on the standard Intl API.
 *
 * This module has **no side effects and no environment access** so it can be
 * imported from Node (API routes, seed script, tests) and from the browser.
 * Every function takes the IANA timezone explicitly; the clinic timezone is
 * injected by the caller (server config or React context).
 *
 * Core idea: the database stores UTC instants (Date). Clinic wall-clock time
 * is only a *projection* of an instant into CLINIC_TIMEZONE. All slot math
 * works in "minutes since clinic-local midnight" for a given clinic-local
 * date key ("YYYY-MM-DD"), and converts to/from UTC with the helpers below.
 *
 * DST safety: conversions use the classic two-pass technique — compute an
 * offset guess, apply it, then re-read the offset at the resulting instant
 * and correct once. This is the same approach used by date-fns-tz.
 */

/* ---------------------------------------------------------------------------
 * Cached Intl formatters
 * ------------------------------------------------------------------------- */

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** Formatter that decomposes an instant into numeric fields in `timeZone`. */
function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = partsFormatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, dtf);
  }
  return dtf;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function getTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = timeFormatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    timeFormatters.set(timeZone, dtf);
  }
  return dtf;
}

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dateFormatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    dateFormatters.set(timeZone, dtf);
  }
  return dtf;
}

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dateTimeFormatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    dateTimeFormatters.set(timeZone, dtf);
  }
  return dtf;
}

/* ---------------------------------------------------------------------------
 * Timezone validation
 * ------------------------------------------------------------------------- */

/** True when `timeZone` is a valid IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Instant -> clinic-local parts
 * ------------------------------------------------------------------------- */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday, in the target timezone. */
  weekday: number;
  /** Minutes since clinic-local midnight. */
  minutes: number;
}

/** Decompose a UTC instant into clinic-local calendar parts. */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = getPartsFormatter(timeZone).formatToParts(instant);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const weekday = new Date(
    Date.UTC(map.year, map.month - 1, map.day),
  ).getUTCDay();
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    weekday,
    minutes: map.hour * 60 + map.minute,
  };
}

/** Clinic-local date key ("YYYY-MM-DD") of a UTC instant. */
export function dateKeyOf(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes since clinic-local midnight for a UTC instant. */
export function minutesOfDay(instant: Date, timeZone: string): number {
  return getZonedParts(instant, timeZone).minutes;
}

/** Clinic-local date key for "now". */
export function todayKey(timeZone: string): string {
  return dateKeyOf(new Date(), timeZone);
}

/* ---------------------------------------------------------------------------
 * Clinic-local wall clock -> UTC instant
 * ------------------------------------------------------------------------- */

/** Offset (ms) of `timeZone` at the given instant (positive when ahead of UTC). */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = getPartsFormatter(timeZone).formatToParts(instant);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convert a clinic-local wall-clock time to the matching UTC instant.
 * @param dateKey   "YYYY-MM-DD" clinic-local date
 * @param minutes   minutes since clinic-local midnight
 * @param timeZone  IANA timezone of the clinic
 */
export function zonedTimeToUtc(
  dateKey: string,
  minutes: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  // Interpret the wall clock as if it were UTC …
  const wallAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  // … then shift by the zone offset at that guess …
  const firstGuess = wallAsUtc - tzOffsetMs(new Date(wallAsUtc), timeZone);
  // … and correct once for DST boundaries (offset may differ at the target).
  const finalOffset = tzOffsetMs(new Date(firstGuess), timeZone);
  const finalMs = wallAsUtc - finalOffset;
  return new Date(finalMs === firstGuess ? firstGuess : finalMs);
}

/* ---------------------------------------------------------------------------
 * Pure date-key arithmetic (UTC-noon trick avoids DST edge cases)
 * ------------------------------------------------------------------------- */

/** Weekday (0 = Sunday … 6 = Saturday) of a date key. */
export function weekdayOfDateKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

/** Add N days to a date key and return the new date key. */
export function addDaysToKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Difference in days between two date keys (a - b). */
export function diffDaysBetweenKeys(a: string, b: string): number {
  const aMs = new Date(`${a}T12:00:00Z`).getTime();
  const bMs = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((aMs - bMs) / 86_400_000);
}

/** True when the date key is a valid "YYYY-MM-DD" calendar date. */
export function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const d = new Date(`${dateKey}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateKey;
}

/* ---------------------------------------------------------------------------
 * Display formatting (clinic timezone)
 * ------------------------------------------------------------------------- */

/** "14:30" — clinic-local time of a UTC instant. */
export function formatTimeInTz(instant: Date, timeZone: string): string {
  return getTimeFormatter(timeZone).format(instant);
}

/** "Mon 12 May 2025" — clinic-local date of a UTC instant. */
export function formatDateInTz(instant: Date, timeZone: string): string {
  return getDateFormatter(timeZone).format(instant);
}

/** "Mon 12 May 2025, 14:30" — clinic-local date and time of a UTC instant. */
export function formatDateTimeInTz(instant: Date, timeZone: string): string {
  return getDateTimeFormatter(timeZone).format(instant);
}

/** "Mon 12" label for a date key (used by day strips). */
export function formatDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
  }).format(d);
}

/** "Monday, 12 May 2025" label for a date key. */
export function formatFullDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/* ---------------------------------------------------------------------------
 * Minutes <-> "HH:MM"
 * ------------------------------------------------------------------------- */

/** 570 -> "09:30". */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "09:30" -> 570. Returns null for malformed input. */
export function hhmmToMinutes(value: string): number | null {
  if (!/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}
