/**
 * Admin stats controller — GET /api/admin/stats (ADMIN only).
 */

import { ROLES } from "@/lib/constants";
import { withApi } from "@/server/errors";
import { requireRole } from "@/server/middleware/auth";
import { getAdminStats } from "@/server/services/stats.service";

export const getStats = withApi(async () => {
  const user = await requireRole(ROLES.ADMIN);
  return { stats: await getAdminStats(user) };
});
