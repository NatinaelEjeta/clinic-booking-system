/**
 * Cron controller — GET /api/cron/reminders
 *
 * Protected by a shared secret: the request must carry
 * `Authorization: Bearer <CRON_SECRET>`. Vercel Cron sends this header
 * automatically when the CRON_SECRET environment variable is set.
 */

import { timingSafeEqual } from "node:crypto";
import { UnauthorizedError, withApi } from "@/server/errors";
import { sendDueReminders } from "@/server/services/reminders.service";

function authorizeCronRequest(req: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new UnauthorizedError("CRON_SECRET is not configured on the server.");
  }

  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // Constant-time comparison (length check first, as timingSafeEqual requires
  // equal-length buffers).
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new UnauthorizedError("Invalid cron authorization.");
  }
}

export const runReminders = withApi(async (req) => {
  authorizeCronRequest(req);
  const result = await sendDueReminders();
  return { ok: true, ...result };
});
