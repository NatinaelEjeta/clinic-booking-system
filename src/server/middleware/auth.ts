/**
 * Session + role-check middleware.
 *
 * SECURITY MODEL
 *   * The JWT lives in an httpOnly cookie — clients cannot read or forge it.
 *   * `requireRole(...)` MUST be called by every protected route handler.
 *   * The user (including their role) is re-loaded from the database on every
 *     request, so revoking/deleting an account takes effect immediately and
 *     the token's payload is never trusted.
 */

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { AUTH_COOKIE, ROLES, type Role } from "@/lib/constants";
import type { UserDTO } from "@/lib/types";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { signSessionToken, verifySessionToken } from "@/server/services/jwt.service";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function getSessionUser(): Promise<UserDTO | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const userId = await verifySessionToken(token);
  if (!userId) return null;

  // Re-load from the database — never trust the token for roles.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      staff: { select: { id: true } },
    },
  });
  if (!user) return null;
  if (user.role !== ROLES.ADMIN && user.role !== ROLES.STAFF && user.role !== ROLES.CUSTOMER) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    staffId: user.staff?.id ?? null,
  };
}

/** Throws 401 when there is no valid session. */
export async function requireUser(): Promise<UserDTO> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Throws 401/403 unless the session user has one of the given roles. */
export async function requireRole(...roles: Role[]): Promise<UserDTO> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new ForbiddenError();
  }
  return user;
}

/** Issue the httpOnly session cookie after login/register. */
export async function setAuthCookie(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function clearAuthCookie(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}
