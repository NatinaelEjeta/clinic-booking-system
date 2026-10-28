/**
 * Shared constants used by both the server and the client.
 * Kept dependency-free so it can be imported from anywhere.
 */

export const ROLES = {
  ADMIN: "ADMIN",
  STAFF: "STAFF",
  CUSTOMER: "CUSTOMER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const APPOINTMENT_STATUSES = [
  "BOOKED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Convenient named access to the appointment status values. */
export const STATUS = {
  BOOKED: "BOOKED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  NO_SHOW: "NO_SHOW",
} as const;

/** Name of the httpOnly cookie that carries the JWT session. */
export const AUTH_COOKIE = "clinic_session";

/** A slot must start at least this many minutes in the future to be bookable. */
export const MIN_NOTICE_MINUTES = 60;

/** Customers may cancel/reschedule only more than this many hours before the start. */
export const CANCEL_WINDOW_HOURS = 24;

/** Candidate slot starts are generated on this grid (minutes). */
export const SLOT_STEP_MINUTES = 15;

/** Default clinic timezone when CLINIC_TIMEZONE is not configured. */
export const DEFAULT_CLINIC_TIMEZONE = "Africa/Addis_Ababa";

/** Demo accounts (emails ending with this) may not change their password. */
export const DEMO_EMAIL_SUFFIX = "@clinic.demo";

/** Where each role lands after login. */
export const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin",
  STAFF: "/schedule",
  CUSTOMER: "/book",
};

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
