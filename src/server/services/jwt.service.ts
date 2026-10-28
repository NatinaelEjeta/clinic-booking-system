/**
 * JWT session tokens (HS256 via jose). The token only carries the user id —
 * roles are ALWAYS re-read from the database on every request, so a stale or
 * forged role claim in the token can never escalate privileges.
 */

import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "@/server/config";

const ALG = "HS256";
const SESSION_DURATION = "7d";

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(new TextEncoder().encode(getJwtSecret()));
}

/** Returns the user id, or null when the token is missing/invalid/expired. */
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(getJwtSecret()));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
