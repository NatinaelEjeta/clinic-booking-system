import {
  createTimeOff,
  getTimeOff,
} from "@/server/controllers/staff.controller";

export const GET = getTimeOff;
export const POST = createTimeOff;
