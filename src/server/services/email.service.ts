/**
 * Transactional email via Resend (https://resend.com).
 *
 * When RESEND_API_KEY is not configured, emails are logged to the server
 * console instead — the app is fully functional without any email provider.
 * All send helpers are best-effort: a failure never breaks the API response.
 */

import { formatDuration } from "@/lib/format";
import { formatDateTimeInTz, formatTimeInTz } from "@/lib/time";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/** Returns true when the email was actually delivered. */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Development mode: log instead of sending. Treated as "handled" so the
    // reminder cron does not re-send the same email on every run.
    console.log(
      `[email:dev] ──────────────────────────────────────────\n` +
        `[email:dev] To:      ${input.to}\n` +
        `[email:dev] Subject: ${input.subject}\n` +
        `[email:dev] (set RESEND_API_KEY to send real emails)\n` +
        `[email:dev] ──────────────────────────────────────────`,
    );
    return true;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "CarePoint Clinic <onboarding@resend.dev>",
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });
    if (!response.ok) {
      console.error(
        `[email] Resend error ${response.status}: ${await response.text()}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] send failed:", error);
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * HTML templates (inline styles for email-client compatibility)
 * ------------------------------------------------------------------------- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f8f8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e9e9;">
<tr><td style="background:#0f766e;color:#ffffff;padding:20px 28px;font-size:18px;font-weight:bold;">CarePoint Clinic</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 12px;font-size:17px;color:#134e4a;">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 28px;background:#f6f8f8;color:#6b7280;font-size:12px;">
All times are shown in the clinic's local timezone.<br/>CarePoint Clinic · this is an automated message, please do not reply.
</td></tr>
</table></td></tr></table></body></html>`;
}

function detailsTable(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">${body}</table>`;
}

/** Shared appointment details for every email type. */
export interface AppointmentEmailData {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  serviceDurationMinutes: number;
  doctorName: string;
  /** UTC start instant. */
  startsAt: Date;
  /** Clinic IANA timezone for display. */
  timezone: string;
}

function appointmentRows(data: AppointmentEmailData): Array<[string, string]> {
  return [
    ["Patient", data.customerName],
    ["Service", `${data.serviceName} (${formatDuration(data.serviceDurationMinutes)})`],
    ["Doctor", data.doctorName],
    ["Date", formatDateTimeInTz(data.startsAt, data.timezone)],
    [
      "Time",
      `${formatTimeInTz(data.startsAt, data.timezone)} (${data.timezone.replace("_", " ")})`,
    ],
  ];
}

const POLICY_NOTE =
  '<p style="margin:14px 0 0;color:#6b7280;font-size:12px;">You can cancel or reschedule free of charge up to 24 hours before the start time.</p>';

/* --------------------------- concrete email builders ------------------------ */

export async function sendBookingConfirmation(data: AppointmentEmailData): Promise<boolean> {
  return sendEmail({
    to: data.customerEmail,
    subject: `Appointment confirmed — ${formatDateTimeInTz(data.startsAt, data.timezone)}`,
    html: emailShell(
      "Your appointment is confirmed",
      detailsTable(appointmentRows(data)) + POLICY_NOTE,
    ),
  });
}

export async function sendCancellationNotice(data: AppointmentEmailData): Promise<boolean> {
  return sendEmail({
    to: data.customerEmail,
    subject: "Your appointment has been cancelled",
    html: emailShell(
      "Your appointment has been cancelled",
      detailsTable(appointmentRows(data)) +
        '<p style="margin:14px 0 0;color:#111827;font-size:13px;">You can book a new appointment online at any time.</p>',
    ),
  });
}

export async function sendRescheduleNotice(
  data: AppointmentEmailData,
  oldStartsAt: Date,
): Promise<boolean> {
  return sendEmail({
    to: data.customerEmail,
    subject: `Your appointment has been moved — ${formatDateTimeInTz(data.startsAt, data.timezone)}`,
    html: emailShell(
      "Your appointment has been rescheduled",
      detailsTable(appointmentRows(data)) +
        `<p style="margin:14px 0 0;color:#6b7280;font-size:12px;">Previous time: ${escapeHtml(
          formatDateTimeInTz(oldStartsAt, data.timezone),
        )}</p>` +
        POLICY_NOTE,
    ),
  });
}

export async function sendReminder(data: AppointmentEmailData): Promise<boolean> {
  return sendEmail({
    to: data.customerEmail,
    subject: `Reminder: appointment tomorrow at ${formatTimeInTz(data.startsAt, data.timezone)}`,
    html: emailShell(
      "Reminder: you have an appointment tomorrow",
      detailsTable(appointmentRows(data)) +
        '<p style="margin:14px 0 0;color:#111827;font-size:13px;">We look forward to seeing you. If you cannot attend, please cancel online as soon as possible.</p>',
    ),
  });
}
