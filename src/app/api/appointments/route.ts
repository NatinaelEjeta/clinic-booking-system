import {
  createAppointment,
  listAppointments,
} from "@/server/controllers/appointments.controller";

export const GET = listAppointments;
export const POST = createAppointment;
