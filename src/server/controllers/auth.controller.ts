/**
 * Auth controllers — parse + validate the request, call the service,
 * manage the session cookie.
 */

import { requireUser } from "@/server/middleware/auth";
import {
  clearAuthCookie,
  setAuthCookie,
} from "@/server/middleware/auth";
import { withApi } from "@/server/errors";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "@/server/validation";
import * as authService from "@/server/services/auth.service";

export const register = withApi(async (req) => {
  const body = registerSchema.parse(await req.json());
  const user = await authService.register(body);
  await setAuthCookie(user.id);
  return { user };
});

export const login = withApi(async (req) => {
  const body = loginSchema.parse(await req.json());
  const user = await authService.login(body);
  await setAuthCookie(user.id);
  return { user };
});

export const logout = withApi(async () => {
  await clearAuthCookie();
  return { ok: true };
});

export const me = withApi(async () => {
  const user = await requireUser();
  return { user };
});

export const changePassword = withApi(async (req) => {
  const user = await requireUser();
  const body = changePasswordSchema.parse(await req.json());
  await authService.changePassword(user, body);
  return { ok: true };
});
