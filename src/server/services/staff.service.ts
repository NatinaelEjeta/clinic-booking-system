/**
 * Staff (doctor) management: profiles, offered services, weekly working
 * hours and time off. Admin-only writes; doctors can read their own data.
 */

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ROLES, WEEKDAY_NAMES } from "@/lib/constants";
import { centsToPrice } from "@/lib/format";
import type { StaffDTO, TimeOffDTO, WorkingHoursDTO } from "@/lib/types";
import { BadRequestError, ConflictError, NotFoundError } from "@/server/errors";

const BCRYPT_ROUNDS = 10;

interface DbStaffRow {
  id: string;
  specialty: string;
  user: { name: string; email: string };
  staffServices: Array<{
    service: {
      id: string;
      name: string;
      durationMinutes: number;
      priceCents: number;
    };
  }>;
}

const STAFF_INCLUDE = {
  user: { select: { name: true, email: true } },
  staffServices: {
    where: { service: { active: true } },
    include: {
      service: {
        select: { id: true, name: true, durationMinutes: true, priceCents: true },
      },
    },
  },
} as const;

function toStaffDTO(row: DbStaffRow): StaffDTO {
  return {
    id: row.id,
    name: row.user.name,
    email: row.user.email,
    specialty: row.specialty,
    services: row.staffServices.map((ss) => ({
      id: ss.service.id,
      name: ss.service.name,
      durationMinutes: ss.service.durationMinutes,
      price: centsToPrice(ss.service.priceCents),
    })),
  };
}

async function findStaffOrThrow(staffId: string) {
  const staff = await db.staff.findUnique({ where: { id: staffId } });
  if (!staff) throw new NotFoundError("Doctor not found.");
  return staff;
}

/* ------------------------------- list / create ------------------------------ */

export async function listStaff(): Promise<StaffDTO[]> {
  const rows = await db.staff.findMany({
    orderBy: { user: { name: "asc" } },
    include: STAFF_INCLUDE,
  });
  return rows.map(toStaffDTO);
}

export async function createStaff(input: {
  name: string;
  email: string;
  password: string;
  specialty: string;
  serviceIds: string[];
}): Promise<StaffDTO> {
  return db.$transaction(async (tx) => {
    const emailTaken = await tx.user.findUnique({ where: { email: input.email } });
    if (emailTaken) throw new ConflictError("An account with this email already exists.");

    const services = input.serviceIds.length
      ? await tx.service.findMany({ where: { id: { in: input.serviceIds } } })
      : [];
    if (services.length !== input.serviceIds.length) {
      throw new BadRequestError("One or more selected services do not exist.");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: ROLES.STAFF,
      },
    });
    const staff = await tx.staff.create({
      data: { userId: user.id, specialty: input.specialty },
    });
    if (input.serviceIds.length) {
      await tx.staffService.createMany({
        data: input.serviceIds.map((serviceId) => ({
          staffId: staff.id,
          serviceId,
        })),
      });
    }

    return toStaffDTO({
      id: staff.id,
      specialty: staff.specialty,
      user: { name: user.name, email: user.email },
      staffServices: services.map((s) => ({
        service: {
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
        },
      })),
    });
  });
}

export async function updateStaff(
  staffId: string,
  input: Partial<{ name: string; specialty: string; serviceIds: string[] }>,
): Promise<StaffDTO> {
  await findStaffOrThrow(staffId);

  return db.$transaction(async (tx) => {
    const current = await tx.staff.findUniqueOrThrow({
      where: { id: staffId },
      select: { userId: true },
    });

    if (input.name !== undefined) {
      await tx.user.update({ where: { id: current.userId }, data: { name: input.name } });
    }
    if (input.specialty !== undefined) {
      await tx.staff.update({ where: { id: staffId }, data: { specialty: input.specialty } });
    }
    if (input.serviceIds !== undefined) {
      const services = input.serviceIds.length
        ? await tx.service.findMany({ where: { id: { in: input.serviceIds } } })
        : [];
      if (services.length !== input.serviceIds.length) {
        throw new BadRequestError("One or more selected services do not exist.");
      }
      await tx.staffService.deleteMany({ where: { staffId } });
      if (input.serviceIds.length) {
        await tx.staffService.createMany({
          data: input.serviceIds.map((serviceId) => ({ staffId, serviceId })),
        });
      }
    }

    const row = await tx.staff.findUniqueOrThrow({
      where: { id: staffId },
      include: STAFF_INCLUDE,
    });
    return toStaffDTO(row);
  });
}

/* ------------------------------ working hours ------------------------------- */

export async function getWorkingHours(staffId: string): Promise<WorkingHoursDTO[]> {
  await findStaffOrThrow(staffId);
  const rows = await db.workingHours.findMany({
    where: { staffId },
    orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    weekday: r.weekday,
    startMinutes: r.startMinutes,
    endMinutes: r.endMinutes,
  }));
}

/**
 * Replace the doctor's whole weekly template in one transaction.
 * Validates that each window ends after it starts and that windows on the
 * same weekday do not overlap.
 */
export async function setWorkingHours(
  staffId: string,
  hours: Array<{ weekday: number; startMinutes: number; endMinutes: number }>,
): Promise<WorkingHoursDTO[]> {
  await findStaffOrThrow(staffId);

  // Validate windows.
  const byWeekday = new Map<number, Array<{ startMinutes: number; endMinutes: number }>>();
  for (const window of hours) {
    if (window.startMinutes >= window.endMinutes) {
      throw new BadRequestError(
        `Working hours for ${WEEKDAY_NAMES[window.weekday]} must end after they start.`,
      );
    }
    const list = byWeekday.get(window.weekday) ?? [];
    list.push(window);
    byWeekday.set(window.weekday, list);
  }
  for (const [weekday, windows] of byWeekday) {
    windows.sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < windows.length; i++) {
      if (windows[i - 1].endMinutes > windows[i].startMinutes) {
        throw new BadRequestError(
          `Working windows overlap on ${WEEKDAY_NAMES[weekday]}.`,
        );
      }
    }
  }

  return db.$transaction(async (tx) => {
    await tx.workingHours.deleteMany({ where: { staffId } });
    if (hours.length) {
      await tx.workingHours.createMany({
        data: hours.map((h) => ({
          staffId,
          weekday: h.weekday,
          startMinutes: h.startMinutes,
          endMinutes: h.endMinutes,
        })),
      });
    }
    const rows = await tx.workingHours.findMany({
      where: { staffId },
      orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      weekday: r.weekday,
      startMinutes: r.startMinutes,
      endMinutes: r.endMinutes,
    }));
  });
}

/* --------------------------------- time off --------------------------------- */

export async function listTimeOff(staffId: string): Promise<TimeOffDTO[]> {
  await findStaffOrThrow(staffId);
  const rows = await db.timeOff.findMany({
    where: { staffId },
    orderBy: { startsAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    reason: r.reason,
  }));
}

export async function createTimeOff(
  staffId: string,
  input: { startsAt: string; endsAt: string; reason: string },
): Promise<TimeOffDTO> {
  await findStaffOrThrow(staffId);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new BadRequestError("Invalid time off timestamps.");
  }
  if (startsAt >= endsAt) {
    throw new BadRequestError("Time off must end after it starts.");
  }
  const row = await db.timeOff.create({
    data: { staffId, startsAt, endsAt, reason: input.reason },
  });
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    reason: row.reason,
  };
}

export async function deleteTimeOff(id: string): Promise<void> {
  const result = await db.timeOff.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Time off entry not found.");
}
