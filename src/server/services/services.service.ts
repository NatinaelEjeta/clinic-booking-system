/**
 * Services (the clinic's bookable catalog).
 * Services are soft-disabled (active=false) instead of deleted so that past
 * appointments always keep a valid reference.
 */

import { db } from "@/lib/db";
import { centsToPrice, priceToCents } from "@/lib/format";
import type { ServiceDTO } from "@/lib/types";
import { ConflictError, NotFoundError } from "@/server/errors";

type DbService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
};

export function toServiceDTO(s: DbService): ServiceDTO {
  return {
    id: s.id,
    name: s.name,
    durationMinutes: s.durationMinutes,
    price: centsToPrice(s.priceCents),
    active: s.active,
  };
}

export async function listServices(includeInactive: boolean): Promise<ServiceDTO[]> {
  const rows = await db.service.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceCents: true,
      active: true,
    },
  });
  return rows.map(toServiceDTO);
}

export async function createService(input: {
  name: string;
  durationMinutes: number;
  price: number;
  active: boolean;
}): Promise<ServiceDTO> {
  const existing = await db.service.findUnique({ where: { name: input.name } });
  if (existing) throw new ConflictError("A service with this name already exists.");

  const service = await db.service.create({
    data: {
      name: input.name,
      durationMinutes: input.durationMinutes,
      priceCents: priceToCents(input.price),
      active: input.active,
    },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceCents: true,
      active: true,
    },
  });
  return toServiceDTO(service);
}

export async function updateService(
  id: string,
  input: Partial<{ name: string; durationMinutes: number; price: number; active: boolean }>,
): Promise<ServiceDTO> {
  const current = await db.service.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Service not found.");

  if (input.name && input.name !== current.name) {
    const clash = await db.service.findUnique({ where: { name: input.name } });
    if (clash) throw new ConflictError("A service with this name already exists.");
  }

  const service = await db.service.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.durationMinutes !== undefined
        ? { durationMinutes: input.durationMinutes }
        : {}),
      ...(input.price !== undefined ? { priceCents: priceToCents(input.price) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceCents: true,
      active: true,
    },
  });
  return toServiceDTO(service);
}

/** Soft-delete: deactivate so history stays intact. */
export async function deactivateService(id: string): Promise<ServiceDTO> {
  const current = await db.service.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Service not found.");
  const service = await db.service.update({
    where: { id },
    data: { active: false },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      priceCents: true,
      active: true,
    },
  });
  return toServiceDTO(service);
}
