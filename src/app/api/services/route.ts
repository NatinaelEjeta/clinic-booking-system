import {
  createService,
  listServices,
} from "@/server/controllers/services.controller";

export const GET = listServices;
export const POST = createService;
