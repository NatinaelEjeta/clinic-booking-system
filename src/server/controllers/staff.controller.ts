/**
 * Staff controllers.
 * GET    /api/staff                       public (doctor directory)
 * POST   /api/staff                       admin (create staff account)
 * PATCH  /api/staff/:id                   admin
 * GET    /api/staff/:id/working-hours     admin or the doctor themself
 * PUT    /api/staff/:id/working-hours     admin
 * GET    /api/staff/:id/time-off          admin or the doctor themself
 * POST   /api/staff/:id/time-off          admin
 * DELETE /api/time-off/:id                admin
 */

import { ROLES } from "@/lib/constants";
import { ForbiddenError, withApi } from "@/server/errors";
import { requireRole, requireUser } from "@/server/middleware/auth";
import {
  createStaffSchema,
  timeOffSchema,
  updateStaffSchema,
  workingHoursSchema,
} from "@/server/validation";
import * as staffService from "@/server/services/staff.service";

export const listStaff = withApi(async () => {
  return { staff: await staffService.listStaff() };
});

export const createStaff = withApi(async (req) => {
  await requireRole(ROLES.ADMIN);
  const body = createStaffSchema.parse(await req.json());
  return { staff: await staffService.createStaff(body) };
});

export const updateStaff = withApi<{ id: string }>(async (req, ctx) => {
  await requireRole(ROLES.ADMIN);
  const { id } = await ctx.params;
  const body = updateStaffSchema.parse(await req.json());
  return { staff: await staffService.updateStaff(id, body) };
});

/** Admins, or the doctor reading their own template. */
async function requireStaffSelfOrAdmin(staffId: string) {
  const user = await requireUser();
  if (user.role === ROLES.ADMIN) return user;
  if (user.role === ROLES.STAFF && user.staffId === staffId) return user;
  throw new ForbiddenError("You can only view your own working hours.");
}

export const getWorkingHours = withApi<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  await requireStaffSelfOrAdmin(id);
  return { hours: await staffService.getWorkingHours(id) };
});

export const putWorkingHours = withApi<{ id: string }>(async (req, ctx) => {
  await requireRole(ROLES.ADMIN);
  const { id } = await ctx.params;
  const body = workingHoursSchema.parse(await req.json());
  return { hours: await staffService.setWorkingHours(id, body.hours) };
});

export const getTimeOff = withApi<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  await requireStaffSelfOrAdmin(id);
  return { timeOff: await staffService.listTimeOff(id) };
});

export const createTimeOff = withApi<{ id: string }>(async (req, ctx) => {
  await requireRole(ROLES.ADMIN);
  const { id } = await ctx.params;
  const body = timeOffSchema.parse(await req.json());
  return { timeOff: await staffService.createTimeOff(id, body) };
});

export const deleteTimeOff = withApi<{ id: string }>(async (_req, ctx) => {
  await requireRole(ROLES.ADMIN);
  const { id } = await ctx.params;
  await staffService.deleteTimeOff(id);
  return { ok: true };
});
