/**
 * Zod schemas for every API request. Parsed at the controller boundary so
 * services always receive typed, validated input.
 */

import { z } from "zod";
import { APPOINTMENT_STATUSES } from "@/lib/constants";

/* ----------------------------------- auth ---------------------------------- */

export const emailField = z
  .email("Enter a valid email address")
  .max(120)
  .transform((value) => value.toLowerCase().trim());

export const nameField = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name is too long");

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password is too long");

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordField,
});

/* --------------------------------- services -------------------------------- */

export const createServiceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name is too long"),
  durationMinutes: z
    .number()
    .int("Duration must be a whole number of minutes")
    .min(5, "Duration must be at least 5 minutes")
    .max(480, "Duration cannot exceed 8 hours"),
  /** Decimal currency units (500 = 500 ETB). */
  price: z
    .number()
    .min(0, "Price cannot be negative")
    .max(1_000_000, "Price is too large"),
  active: z.boolean().default(true),
});

export const updateServiceSchema = createServiceSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

/* ----------------------------------- staff --------------------------------- */

export const createStaffSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  specialty: z
    .string()
    .trim()
    .min(2, "Specialty must be at least 2 characters")
    .max(120, "Specialty is too long"),
  serviceIds: z.array(z.string().min(1)).max(50).default([]),
});

export const updateStaffSchema = z
  .object({
    name: nameField,
    specialty: z.string().trim().min(2).max(120),
    serviceIds: z.array(z.string().min(1)).max(50),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

/* ------------------------------ working hours ------------------------------ */

export const workingHoursWindowSchema = z.object({
  /** 0 = Sunday … 6 = Saturday. */
  weekday: z.number().int().min(0).max(6),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(1).max(1440),
});

export const workingHoursSchema = z.object({
  hours: z.array(workingHoursWindowSchema).max(21, "Too many working windows"),
});

/* --------------------------------- time off -------------------------------- */

export const timeOffSchema = z.object({
  startsAt: z.iso.datetime("startsAt must be an ISO UTC timestamp"),
  endsAt: z.iso.datetime("endsAt must be an ISO UTC timestamp"),
  reason: z.string().trim().max(200).default(""),
});

/* ---------------------------------- slots ---------------------------------- */

export const dateKeyField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be a YYYY-MM-DD string");

export const slotsQuerySchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  date: dateKeyField,
  staffId: z.string().min(1).optional(),
});

/* ------------------------------- appointments ------------------------------ */

export const bookAppointmentSchema = z.object({
  serviceId: z.string().min(1, "Choose a service"),
  staffId: z.string().min(1, "Choose a doctor"),
  startsAt: z.iso.datetime("startsAt must be an ISO UTC timestamp"),
  notes: z.string().trim().max(500, "Notes are too long").default(""),
});

export const appointmentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("reschedule"),
    startsAt: z.iso.datetime("startsAt must be an ISO UTC timestamp"),
  }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("no-show") }),
]);

export const appointmentListQuerySchema = z.object({
  /** Single clinic-local day. */
  date: dateKeyField.optional(),
  /** Inclusive clinic-local range start. */
  from: dateKeyField.optional(),
  /** Inclusive clinic-local range end. */
  to: dateKeyField.optional(),
  /** Shortcut for today in the clinic timezone. */
  scope: z.enum(["today"]).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  /** Admin only filters. */
  customerId: z.string().min(1).optional(),
  staffId: z.string().min(1).optional(),
});
