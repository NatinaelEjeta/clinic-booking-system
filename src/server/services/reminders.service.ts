/**
 * Reminder cron service.
 *
 * Finds BOOKED appointments starting 23–25 hours from now that have not had
 * their reminder email sent yet, sends the reminder, and stamps
 * `reminderSentAt`. The 2-hour matching window + daily cron schedule means
 * every upcoming appointment is caught exactly once, on the day before.
 */

import { db } from "@/lib/db";
import { STATUS } from "@/lib/constants";
import { sendReminder } from "@/server/services/email.service";
import { CLINIC_TIMEZONE } from "@/server/config";

export interface ReminderRunResult {
  matched: number;
  sent: number;
  failed: number;
}

export async function sendDueReminders(): Promise<ReminderRunResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 3_600_000);
  const windowEnd = new Date(now.getTime() + 25 * 3_600_000);

  const due = await db.appointment.findMany({
    where: {
      status: STATUS.BOOKED,
      reminderSentAt: null,
      startsAt: { gte: windowStart, lte: windowEnd },
    },
    include: {
      customer: { select: { name: true, email: true } },
      service: { select: { name: true, durationMinutes: true } },
      staff: { include: { user: { select: { name: true } } } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const appointment of due) {
    const delivered = await sendReminder({
      customerName: appointment.customer.name,
      customerEmail: appointment.customer.email,
      serviceName: appointment.service.name,
      serviceDurationMinutes: appointment.service.durationMinutes,
      doctorName: appointment.staff.user.name,
      startsAt: appointment.startsAt,
      timezone: CLINIC_TIMEZONE,
    });

    if (delivered) {
      await db.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } else {
      failed++; // not marked -> retried on the next cron run
    }
  }

  return { matched: due.length, sent, failed };
}
