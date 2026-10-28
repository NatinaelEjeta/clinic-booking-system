/**
 * Slots controller — GET /api/slots?serviceId=&date=&staffId=
 * Public: customers browse availability before signing in.
 */

import { BadRequestError, withApi } from "@/server/errors";
import { isValidDateKey } from "@/lib/time";
import { slotsQuerySchema } from "@/server/validation";
import { getAvailableSlots } from "@/server/services/availability.service";

export const listSlots = withApi(async (req) => {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const query = slotsQuerySchema.parse(params);

  if (!isValidDateKey(query.date)) {
    throw new BadRequestError("date must be a valid YYYY-MM-DD calendar date.");
  }

  const result = await getAvailableSlots(query);
  return result;
});
