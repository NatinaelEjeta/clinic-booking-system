/**
 * Authentication service: registration, login, password change.
 * Customers self-register; staff/admin accounts are created by admins
 * (see the staff service).
 */

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { DEMO_EMAIL_SUFFIX, ROLES } from "@/lib/constants";
import type { UserDTO } from "@/lib/types";
import { ConflictError, ForbiddenError, UnauthorizedError } from "@/server/errors";

const BCRYPT_ROUNDS = 10;

type DbUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  staff?: { id: string } | null;
};

export function toUserDTO(user: DbUser): UserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserDTO["role"],
    staffId: user.staff?.id ?? null,
  };
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<UserDTO> {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: ROLES.CUSTOMER,
    },
    select: { id: true, name: true, email: true, role: true },
  });
  return toUserDTO(user);
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<UserDTO> {
  const user = await db.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      staff: { select: { id: true } },
    },
  });
  // Same error for unknown email and wrong password (no account enumeration).
  if (!user) throw new UnauthorizedError("Invalid email or password.");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError("Invalid email or password.");

  return toUserDTO(user);
}

/**
 * Change the signed-in user's password.
 * Demo accounts (emails ending in @clinic.demo) are blocked so the shared
 * demo credentials keep working.
 */
export async function changePassword(
  user: UserDTO,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  if (user.email.endsWith(DEMO_EMAIL_SUFFIX)) {
    throw new ForbiddenError(
      "Demo accounts cannot change their password. Sign up for a free account to try this feature.",
    );
  }

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record) throw new UnauthorizedError();

  const valid = await bcrypt.compare(input.currentPassword, record.passwordHash);
  if (!valid) {
    throw new UnauthorizedError("Your current password is incorrect.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
}
