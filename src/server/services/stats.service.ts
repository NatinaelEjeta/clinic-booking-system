/**
 * Admin dashboard statistics: today's schedule, 7-day booking chart,
 * top services and the cancellation rate.
 */

import { db } from "@/lib/db";
import { STATUS } from "@/lib/constants";
import type { AdminStats } from "@/lib/types";
import { CLINIC_TIMEZONE } from "@/server/config";
import {
  addDaysToKey,
  dateKeyOf,
  formatDayLabel,
  todayKey,
  zonedTimeToUtc,
} from "@/lib/time";
import { toAppointmentDTO } from "@/server/services/appointments.service";
import type { UserDTO } from "@/lib/types";

const APPOINTMENT_INCLUDE = {
  service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
  staff: { include: { user: { select: { name: true } } } },
  customer: { select: { id: true, name: true, email: true } },
};

export async function getAdminStats(viewer: UserDTO): Promise<AdminStats> {
  const tz = CLINIC_TIMEZONE;
  const today = todayKey(tz);
  const todayStart = zonedTimeToUtc(today, 0, tz);
  const todayEnd = zonedTimeToUtc(addDaysToKey(today, 1), 0, tz);
  const weekEnd = zonedTimeToUtc(addDaysToKey(today, 7), 0, tz);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  const [todayAppointments, weekRows, statusGroups, serviceGroups] = await Promise.all([
    db.appointment.findMany({
      where: { startsAt: { gte: todayStart, lt: todayEnd } },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: "asc" },
    }),
    db.appointment.findMany({
      where: { startsAt: { gte: todayStart, lt: weekEnd } },
      select: { startsAt: true, status: true },
    }),
    db.appointment.groupBy({ by: ["status"], _count: { _all: true } }),
    db.appointment.groupBy({
      by: ["serviceId"],
      _count: { _all: true },
      where: { startsAt: { gte: thirtyDaysAgo }, status: { not: STATUS.CANCELLED } },
    }),
  ]);

  // Bookings per day for the next 7 days (non-cancelled).
  const bookingsPerDay: AdminStats["bookingsPerDay"] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDaysToKey(today, i);
    const count = weekRows.filter(
      (row) => dateKeyOf(row.startsAt, tz) === key && row.status !== STATUS.CANCELLED,
    ).length;
    bookingsPerDay.push({ date: key, label: formatDayLabel(key), bookings: count });
  }

  const totals = { total: 0, booked: 0, cancelled: 0, completed: 0, noShow: 0 };
  for (const group of statusGroups) {
    const count = group._count._all;
    totals.total += count;
    if (group.status === STATUS.BOOKED) totals.booked = count;
    if (group.status === STATUS.CANCELLED) totals.cancelled = count;
    if (group.status === STATUS.COMPLETED) totals.completed = count;
    if (group.status === STATUS.NO_SHOW) totals.noShow = count;
  }

  // Top services over the last 30 days.
  const serviceIds = serviceGroups.map((g) => g.serviceId);
  const services = serviceIds.length
    ? await db.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true },
      })
    : [];
  const topServices = serviceGroups
    .map((group) => ({
      serviceId: group.serviceId,
      name: services.find((s) => s.id === group.serviceId)?.name ?? "Unknown service",
      count: group._count._all,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    timezone: tz,
    today,
    todayCount: todayAppointments.length,
    todayAppointments: todayAppointments.map((row) => toAppointmentDTO(row, viewer)),
    next7DaysCount: bookingsPerDay.reduce((sum, day) => sum + day.bookings, 0),
    bookingsPerDay,
    topServices,
    totals,
    cancellationRate:
      totals.total === 0
        ? 0
        : Math.round((totals.cancelled / totals.total) * 1000) / 10,
  };
}
