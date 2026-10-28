/**
 * Server-side configuration (env access). Never import this from client code.
 */

import { DEFAULT_CLINIC_TIMEZONE } from "@/lib/constants";
import { isValidTimeZone } from "@/lib/time";

/** Clinic timezone used for all scheduling math and display. */
export const CLINIC_TIMEZONE = (() => {
  const tz = process.env.CLINIC_TIMEZONE || DEFAULT_CLINIC_TIMEZONE;
  return isValidTimeZone(tz) ? tz : DEFAULT_CLINIC_TIMEZONE;
})();

/** JWT signing secret (requires >= 16 characters). */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET is missing or too short — set it to a random string of at least 16 characters (see .env.example).",
    );
  }
  return secret;
}

/** True when the configured database is PostgreSQL (production/Neon). */
export function isPostgres(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("postgres");
}
