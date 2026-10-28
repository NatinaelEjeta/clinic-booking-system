import { createStaff, listStaff } from "@/server/controllers/staff.controller";

export const GET = listStaff;
export const POST = createStaff;
