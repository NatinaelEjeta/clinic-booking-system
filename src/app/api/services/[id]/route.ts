import {
  deactivateService,
  updateService,
} from "@/server/controllers/services.controller";

export const PATCH = updateService;
export const DELETE = deactivateService;
