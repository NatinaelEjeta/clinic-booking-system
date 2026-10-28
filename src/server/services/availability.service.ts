/**
 * Availability service — loads doctor schedules from the database and feeds
 * them to the pure slot engine (./slots.ts). Two entry points share the same
 * core:
 *   * getAvailableSlots() — the public slot browser API,
 *   * loadSlotContextForInstant() — fresh context INSIDE the booking
 *     transaction, so what the customer saw is re-verified before insert.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { STATUS } from "@/lib/constants";
import type { SlotsResponse, SlotDTO } from "@/lib/types";
import { BadRequestError, NotFoundError } from "@/server/errors";
import { CLINIC_TIMEZONE } from "@/server/config";
import {
  addDaysToKey,
  dateKeyOf,
  isValidDateKey,
  weekdayOfDateKey,
  zonedTimeToUtc,
} from "@/lib/time";
import { generateSlots, type SlotContext } from "@/server/services/slots";

/**
 * GET /api/slots for one service on one clinic-local date, optionally for a
 * specific doctor. Without staffId ("any doctor"), the response merges the
 * availability of every doctor offering the service and each slot lists the
 * free doctor ids.
 */
export async function getAvailableSlots(input: {
  serviceId: string;
  date: string;
  staffId?: string;
}): Promise<SlotsResponse> {
  if (!isValidDateKey(input.date)) {
    throw new BadRequestError("date must be a valid YYYY-MM-DD calendar date.");
  }

  const service = await db.service.findUnique({ where: { id: input.serviceId } });
  if (!service || !service.active) throw new NotFoundError("Service not found.");

  const anyDoctor = !input.staffId;

  // Resolve the doctor list to check.
  let doctorIds: string[];
  if (input.staffId) {
    const staff = await db.staff.findUnique({
      where: { id: input.staffId },
      include: { staffServices: { select: { serviceId: true } } },
    });
    if (!staff) throw new NotFoundError("Doctor not found.");
    if (!staff.staffServices.some((ss) => ss.serviceId === service.id)) {
      throw new BadRequestError("This doctor does not offer the selected service.");
    }
    doctorIds = [staff.id];
  } else {
    const links = await db.staffService.findMany({
      where: { serviceId: service.id },
      select: { staffId: true },
    });
    doctorIds = [...new Set(links.map((l) => l.staffId))];
  }

  const weekday = weekdayOfDateKey(input.date);
  const dayStart = zonedTimeToUtc(input.date, 0, CLINIC_TIMEZONE);
  const dayEnd = zonedTimeToUtc(addDaysToKey(input.date, 1), 0, CLINIC_TIMEZONE);
  const now = new Date();

  const merged = new Map<string, SlotDTO & { staffIds?: string[] }>();

  for (const staffId of doctorIds) {
    const [windows, timeOff, appointments] = await Promise.all([
      db.workingHours.findMany({ where: { staffId, weekday } }),
      db.timeOff.findMany({
        where: { staffId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      }),
      db.appointment.findMany({
        where: {
          staffId,
          status: { not: STATUS.CANCELLED },
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    const ctx: SlotContext = {
      timeZone: CLINIC_TIMEZONE,
      dateKey: input.date,
      durationMinutes: service.durationMinutes,
      workingWindows: windows.map((w) => ({
        weekday: w.weekday,
        startMinutes: w.startMinutes,
        endMinutes: w.endMinutes,
      })),
      timeOff: timeOff.map((t) => ({ start: t.startsAt, end: t.endsAt })),
      appointments: appointments.map((a) => ({ start: a.startsAt, end: a.endsAt })),
      now,
    };

    for (const slot of generateSlots(ctx)) {
      const key = slot.startsAt.toISOString();
      const existing = merged.get(key);
      if (existing) {
        existing.staffIds?.push(staffId);
      } else {
        merged.set(key, {
          startsAt: key,
          endsAt: slot.endsAt.toISOString(),
          startTime: slot.startTime,
          ...(anyDoctor ? { staffIds: [staffId] } : {}),
        });
      }
    }
  }

  const slots = [...merged.values()].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );

  return {
    serviceId: service.id,
    staffId: input.staffId ?? null,
    date: input.date,
    timezone: CLINIC_TIMEZONE,
    slots,
  };
}

/**
 * Build a fresh SlotContext for one specific instant — used INSIDE the
 * booking/reschedule transaction so the availability re-check races no one.
 * `excludeAppointmentId` removes the appointment being rescheduled from the
 * doctor's busy list.
 */
export async function loadSlotContextForInstant(
  tx: Prisma.TransactionClient,
  params: {
    staffId: string;
    durationMinutes: number;
    startsAt: Date;
    excludeAppointmentId?: string;
  },
): Promise<SlotContext> {
  const dateKey = dateKeyOf(params.startsAt, CLINIC_TIMEZONE);
  const dayStart = zonedTimeToUtc(dateKey, 0, CLINIC_TIMEZONE);
  const dayEnd = zonedTimeToUtc(addDaysToKey(dateKey, 1), 0, CLINIC_TIMEZONE);
  const weekday = weekdayOfDateKey(dateKey);

  const [windows, timeOff, appointments] = await Promise.all([
    tx.workingHours.findMany({ where: { staffId: params.staffId, weekday } }),
    tx.timeOff.findMany({
      where: { staffId: params.staffId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
    }),
    tx.appointment.findMany({
      where: {
        staffId: params.staffId,
        status: { not: STATUS.CANCELLED },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        ...(params.excludeAppointmentId
          ? { id: { not: params.excludeAppointmentId } }
          : {}),
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  return {
    timeZone: CLINIC_TIMEZONE,
    dateKey,
    durationMinutes: params.durationMinutes,
    workingWindows: windows.map((w) => ({
      weekday: w.weekday,
      startMinutes: w.startMinutes,
      endMinutes: w.endMinutes,
    })),
    timeOff: timeOff.map((t) => ({ start: t.startsAt, end: t.endsAt })),
    appointments: appointments.map((a) => ({ start: a.startsAt, end: a.endsAt })),
    now: new Date(),
  };
}
