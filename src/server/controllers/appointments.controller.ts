/**
 * Appointment controllers.
 * GET   /api/appointments      role-scoped list (customer=own, doctor=own schedule, admin=all)
 * POST  /api/appointments      customer books (201)
 * PATCH /api/appointments/:id  action: cancel | reschedule | complete | no-show
 */

import { ROLES } from "@/lib/constants";
import { withApi } from "@/server/errors";
import { requireRole, requireUser } from "@/server/middleware/auth";
import {
  appointmentActionSchema,
  appointmentListQuerySchema,
  bookAppointmentSchema,
} from "@/server/validation";
import * as appointmentsService from "@/server/services/appointments.service";

export const listAppointments = withApi(async (req) => {
  const user = await requireUser();
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const query = appointmentListQuerySchema.parse(params);
  return { appointments: await appointmentsService.listAppointments(user, query) };
});

export const createAppointment = withApi(async (req) => {
  const user = await requireRole(ROLES.CUSTOMER);
  const body = bookAppointmentSchema.parse(await req.json());
  const appointment = await appointmentsService.bookAppointment(user, body);
  return Response.json({ appointment }, { status: 201 });
});

export const patchAppointment = withApi<{ id: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = appointmentActionSchema.parse(await req.json());

  let appointment;
  switch (body.action) {
    case "cancel":
      appointment = await appointmentsService.cancelAppointment(user, id);
      break;
    case "reschedule":
      appointment = await appointmentsService.rescheduleAppointment(user, id, body.startsAt);
      break;
    case "complete":
      appointment = await appointmentsService.markVisitOutcome(user, id, "complete");
      break;
    case "no-show":
      appointment = await appointmentsService.markVisitOutcome(user, id, "no-show");
      break;
  }

  return { appointment };
});
