/**
 * Service catalog controllers.
 * GET /api/services            public (active only) — admin sees all with ?all=1
 * POST /api/services           admin
 * PATCH /api/services/:id      admin
 * DELETE /api/services/:id     admin (soft deactivate)
 */

import { ROLES } from "@/lib/constants";
import { withApi } from "@/server/errors";
import { requireRole } from "@/server/middleware/auth";
import {
  createServiceSchema,
  updateServiceSchema,
} from "@/server/validation";
import * as servicesService from "@/server/services/services.service";

export const listServices = withApi(async (req) => {
  const includeInactive = req.nextUrl.searchParams.get("all") === "1";
  if (includeInactive) {
    await requireRole(ROLES.ADMIN);
  }
  return { services: await servicesService.listServices(includeInactive) };
});

export const createService = withApi(async (req) => {
  await requireRole(ROLES.ADMIN);
  const body = createServiceSchema.parse(await req.json());
  return { service: await servicesService.createService(body) };
});

export const updateService = withApi<{ id: string }>(async (req, ctx) => {
  await requireRole(ROLES.ADMIN);
  const { id } = await ctx.params;
  const body = updateServiceSchema.parse(await req.json());
  return { service: await servicesService.updateService(id, body) };
});

export const deactivateService = withApi<{ id: string }>(async (_req, ctx) => {
  await requireRole(ROLES.ADMIN);
  const { id } = await ctx.params;
  return { service: await servicesService.deactivateService(id) };
});
