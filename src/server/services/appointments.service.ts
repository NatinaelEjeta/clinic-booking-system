/**
 * Appointment service — booking, rescheduling, cancelling and visit outcomes.
 *
 * DOUBLE-BOOKING PROTECTION
 * -------------------------
 * `bookAppointment` and `rescheduleAppointment` re-verify slot availability
 * INSIDE a database transaction, right before the write:
 *   * SQLite (local): Prisma serializes interactive transactions, so the
 *     check-then-insert sequence is atomic.
 *   * PostgreSQL (Neon/production): the transaction runs with isolation
 *     level SERIALIZABLE. If two customers confirm the same slot at the same
 *     millisecond, one transaction is aborted by Postgres (Prisma error
 *     P2034) and the centralized error handler turns it into HTTP 409 —
 *     "That slot was just taken. Please choose another time."
 * The very same pure `evaluateSlot` function that powers the public slot
 * browser performs the check, so the UI can never disagree with the
 * transaction.
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ROLES, STATUS, type AppointmentStatus } from "@/lib/constants";
import { centsToPrice } from "@/lib/format";
import type { AppointmentDTO, UserDTO } from "@/lib/types";
import { ApiError, BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { CLINIC_TIMEZONE, isPostgres } from "@/server/config";
import {
  addDaysToKey,
  dateKeyOf,
  todayKey,
  zonedTimeToUtc,
} from "@/lib/time";
import {
  cancellationWindowViolation,
  evaluateSlot,
  intervalsOverlap,
  SLOT_REJECTION_MESSAGES,
  SLOT_REJECTION_STATUS,
  type SlotRejection,
} from "@/server/services/slots";
import { loadSlotContextForInstant } from "@/server/services/availability.service";
import {
  sendBookingConfirmation,
  sendCancellationNotice,
  sendRescheduleNotice,
  type AppointmentEmailData,
} from "@/server/services/email.service";

const APPOINTMENT_INCLUDE = {
  service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
  staff: { include: { user: { select: { name: true } } } },
  customer: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

/** Serializable isolation on Postgres; SQLite serializes transactions anyway. */
function txOptions(): Prisma.PrismaClientOptions["transactionOptions"] | undefined {
  return isPostgres()
    ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    : undefined;
}

function throwSlotRejection(reason: SlotRejection): never {
  throw new ApiError(
    SLOT_REJECTION_STATUS[reason],
    SLOT_REJECTION_MESSAGES[reason],
    reason === "conflict" ? "SLOT_TAKEN" : "SLOT_UNAVAILABLE",
  );
}

/** Map a DB row to the API DTO, computing what the current viewer may do. */
export function toAppointmentDTO(row: AppointmentRow, viewer: UserDTO): AppointmentDTO {
  const now = new Date();
  const isOwner = viewer.id === row.customerId;
  const changeAllowed =
    isOwner &&
    row.status === STATUS.BOOKED &&
    cancellationWindowViolation(now, row.startsAt) === null;

  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status as AppointmentStatus,
    notes: row.notes,
    reminderSentAt: row.reminderSentAt ? row.reminderSentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    canCancel: changeAllowed,
    canReschedule: changeAllowed,
    service: {
      id: row.service.id,
      name: row.service.name,
      durationMinutes: row.service.durationMinutes,
      price: centsToPrice(row.service.priceCents),
    },
    staff: {
      id: row.staff.id,
      name: row.staff.user.name,
      specialty: row.staff.specialty,
    },
    // Only staff/admin viewers see who the patient is.
    ...(viewer.role !== ROLES.CUSTOMER
      ? { customer: { id: row.customer.id, name: row.customer.name } }
      : {}),
  };
}

/* ------------------------------- list ------------------------------- */

export interface AppointmentListQuery {
  date?: string;
  from?: string;
  to?: string;
  scope?: "today";
  status?: AppointmentStatus;
  customerId?: string;
  staffId?: string;
}

export async function listAppointments(
  user: UserDTO,
  query: AppointmentListQuery,
): Promise<AppointmentDTO[]> {
  const where: Prisma.AppointmentWhereInput = {};

  // Role scoping — the server decides whose appointments are visible.
  if (user.role === ROLES.CUSTOMER) {
    where.customerId = user.id;
  } else if (user.role === ROLES.STAFF) {
    if (!user.staffId) return [];
    where.staffId = user.staffId;
  } else {
    if (query.customerId) where.customerId = query.customerId;
    if (query.staffId) where.staffId = query.staffId;
  }

  if (query.status) where.status = query.status;

  // Clinic-local day ranges (inclusive of the whole end day).
  if (query.scope === "today" || query.date || query.from || query.to) {
    const startsAt: Prisma.DateTimeFilter = {};
    if (query.scope === "today" || query.date) {
      const key = query.scope === "today" ? todayKey(CLINIC_TIMEZONE) : query.date!;
      startsAt.gte = zonedTimeToUtc(key, 0, CLINIC_TIMEZONE);
      startsAt.lt = zonedTimeToUtc(addDaysToKey(key, 1), 0, CLINIC_TIMEZONE);
    } else {
      if (query.from) startsAt.gte = zonedTimeToUtc(query.from, 0, CLINIC_TIMEZONE);
      if (query.to) startsAt.lt = zonedTimeToUtc(addDaysToKey(query.to, 1), 0, CLINIC_TIMEZONE);
    }
    where.startsAt = startsAt;
  }

  const ascending = Boolean(query.date || query.from || query.to || query.scope);

  const rows = await db.appointment.findMany({
    where,
    include: APPOINTMENT_INCLUDE,
    orderBy: { startsAt: ascending ? "asc" : "desc" },
    take: 500,
  });

  return rows.map((row) => toAppointmentDTO(row, user));
}

/* ------------------------------- book ------------------------------- */

export interface BookAppointmentInput {
  serviceId: string;
  staffId: string;
  startsAt: string;
  notes: string;
}

export async function bookAppointment(
  user: UserDTO,
  input: BookAppointmentInput,
): Promise<AppointmentDTO> {
  if (user.role !== ROLES.CUSTOMER) {
    throw new ForbiddenError("Only patient accounts can book appointments.");
  }

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new BadRequestError("startsAt must be a valid ISO timestamp.");
  }

  const row = await db.$transaction(async (tx) => {
    // 1. Load and validate the service and doctor.
    const service = await tx.service.findUnique({ where: { id: input.serviceId } });
    if (!service || !service.active) throw new NotFoundError("Service not found.");

    const staff = await tx.staff.findUnique({
      where: { id: input.staffId },
      include: { staffServices: { select: { serviceId: true } }, user: { select: { name: true } } },
    });
    if (!staff) throw new NotFoundError("Doctor not found.");
    if (!staff.staffServices.some((ss) => ss.serviceId === service.id)) {
      throw new BadRequestError("This doctor does not offer the selected service.");
    }

    // 2. Re-verify availability with fresh data INSIDE the transaction.
    const ctx = await loadSlotContextForInstant(tx, {
      staffId: staff.id,
      durationMinutes: service.durationMinutes,
      startsAt,
    });
    const evaluation = evaluateSlot(ctx, startsAt);
    if (!evaluation.ok) throwSlotRejection(evaluation.reason);

    // 3. The patient must not have two overlapping appointments.
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const customerAppointments = await tx.appointment.findMany({
      where: {
        customerId: user.id,
        status: { not: STATUS.CANCELLED },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { startsAt: true, endsAt: true },
    });
    if (
      customerAppointments.some((a) =>
        intervalsOverlap(
          { start: a.startsAt, end: a.endsAt },
          { start: startsAt, end: endsAt },
        ),
      )
    ) {
      throw new ConflictError(
        "You already have another appointment that overlaps this time.",
      );
    }

    // 4. Insert — the transaction commit makes the slot taken atomically.
    return tx.appointment.create({
      data: {
        customerId: user.id,
        staffId: staff.id,
        serviceId: service.id,
        startsAt,
        endsAt,
        status: STATUS.BOOKED,
        notes: input.notes,
      },
      include: APPOINTMENT_INCLUDE,
    });
  }, txOptions());

  // 5. Confirmation email — best effort, never fails the request.
  await sendBookingConfirmation(emailDataFor(row)).catch(() => false);

  return toAppointmentDTO(row, user);
}

/* ------------------------------- cancel ------------------------------ */

export async function cancelAppointment(
  user: UserDTO,
  appointmentId: string,
): Promise<AppointmentDTO> {
  const row = await db.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) throw new NotFoundError("Appointment not found.");

    if (appointment.customerId !== user.id) {
      throw new ForbiddenError("Only the patient who booked this appointment can cancel it.");
    }
    if (appointment.status !== STATUS.BOOKED) {
      throw new ConflictError("Only booked appointments can be cancelled.");
    }

    const violation = cancellationWindowViolation(new Date(), appointment.startsAt);
    if (violation) throw new ConflictError(violation);

    return tx.appointment.update({
      where: { id: appointmentId },
      data: { status: STATUS.CANCELLED },
      include: APPOINTMENT_INCLUDE,
    });
  }, txOptions());

  await sendCancellationNotice(emailDataFor(row)).catch(() => false);
  return toAppointmentDTO(row, user);
}

/* ----------------------------- reschedule ---------------------------- */

export async function rescheduleAppointment(
  user: UserDTO,
  appointmentId: string,
  newStartsAtIso: string,
): Promise<AppointmentDTO> {
  const newStartsAt = new Date(newStartsAtIso);
  if (Number.isNaN(newStartsAt.getTime())) {
    throw new BadRequestError("startsAt must be a valid ISO timestamp.");
  }

  const { row, oldStartsAt } = await db.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) throw new NotFoundError("Appointment not found.");

    if (appointment.customerId !== user.id) {
      throw new ForbiddenError("Only the patient who booked this appointment can reschedule it.");
    }
    if (appointment.status !== STATUS.BOOKED) {
      throw new ConflictError("Only booked appointments can be rescheduled.");
    }

    // The 24-hour change window applies to the ORIGINAL start time.
    const violation = cancellationWindowViolation(new Date(), appointment.startsAt);
    if (violation) throw new ConflictError(violation);

    // Re-check availability at the NEW time, excluding this appointment
    // itself from the doctor's busy list.
    const ctx = await loadSlotContextForInstant(tx, {
      staffId: appointment.staffId,
      durationMinutes: appointment.service.durationMinutes,
      startsAt: newStartsAt,
      excludeAppointmentId: appointment.id,
    });
    const evaluation = evaluateSlot(ctx, newStartsAt);
    if (!evaluation.ok) throwSlotRejection(evaluation.reason);

    // The patient must not overlap with any OTHER appointment either.
    const endsAt = new Date(newStartsAt.getTime() + appointment.service.durationMinutes * 60_000);
    const customerAppointments = await tx.appointment.findMany({
      where: {
        customerId: user.id,
        status: { not: STATUS.CANCELLED },
        id: { not: appointment.id },
        startsAt: { lt: endsAt },
        endsAt: { gt: newStartsAt },
      },
      select: { startsAt: true, endsAt: true },
    });
    if (
      customerAppointments.some((a) =>
        intervalsOverlap(
          { start: a.startsAt, end: a.endsAt },
          { start: newStartsAt, end: endsAt },
        ),
      )
    ) {
      throw new ConflictError(
        "You already have another appointment that overlaps this time.",
      );
    }

    const updated = await tx.appointment.update({
      where: { id: appointmentId },
      data: { startsAt: newStartsAt, endsAt },
      include: APPOINTMENT_INCLUDE,
    });
    return { row: updated, oldStartsAt: appointment.startsAt };
  }, txOptions());

  await sendRescheduleNotice(emailDataFor(row), oldStartsAt).catch(() => false);
  return toAppointmentDTO(row, user);
}

/* --------------------------- visit outcomes -------------------------- */

export async function markVisitOutcome(
  user: UserDTO,
  appointmentId: string,
  outcome: "complete" | "no-show",
): Promise<AppointmentDTO> {
  if (user.role !== ROLES.STAFF || !user.staffId) {
    throw new ForbiddenError("Only the treating doctor can update the visit outcome.");
  }

  const row = await db.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: APPOINTMENT_INCLUDE,
    });
    if (!appointment) throw new NotFoundError("Appointment not found.");

    if (appointment.staffId !== user.staffId) {
      throw new ForbiddenError("You can only update your own appointments.");
    }
    if (appointment.status !== STATUS.BOOKED) {
      throw new ConflictError("Only booked appointments can be marked.");
    }
    if (appointment.startsAt.getTime() > Date.now()) {
      throw new BadRequestError("The appointment has not started yet.");
    }

    return tx.appointment.update({
      where: { id: appointmentId },
      data: { status: outcome === "complete" ? STATUS.COMPLETED : STATUS.NO_SHOW },
      include: APPOINTMENT_INCLUDE,
    });
  }, txOptions());

  return toAppointmentDTO(row, user);
}

/* ------------------------------- helpers ----------------------------- */

function emailDataFor(row: AppointmentRow): AppointmentEmailData {
  return {
    customerName: row.customer.name,
    customerEmail: row.customer.email,
    serviceName: row.service.name,
    serviceDurationMinutes: row.service.durationMinutes,
    doctorName: row.staff.user.name,
    startsAt: row.startsAt,
    timezone: CLINIC_TIMEZONE,
  };
}
