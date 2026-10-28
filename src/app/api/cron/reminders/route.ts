import { runReminders } from "@/server/controllers/cron.controller";

export const GET = runReminders;
export const dynamic = "force-dynamic";
