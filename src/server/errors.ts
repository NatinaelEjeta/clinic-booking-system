/**
 * Centralized API error handling.
 *
 * Every route handler is wrapped with `withApi`, which:
 *   1. runs the handler,
 *   2. serializes its return value as JSON,
 *   3. converts every thrown error into a consistent JSON error envelope:
 *        { "error": { "code": "...", "message": "..." } }
 *
 * Supported statuses: 400, 401, 403, 404, 409 (+ 500 for unexpected errors).
 */

import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class BadRequestError extends ApiError {
  constructor(message = "Bad request", code = "BAD_REQUEST") {
    super(400, message, code);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "You must be signed in.", code = "UNAUTHORIZED") {
    super(401, message, code);
  }
}

export class ForbiddenError extends ApiError {
  constructor(
    message = "You do not have permission to perform this action.",
    code = "FORBIDDEN",
  ) {
    super(403, message, code);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found.", code = "NOT_FOUND") {
    super(404, message, code);
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict with the current state.", code = "CONFLICT") {
    super(409, message, code);
  }
}

/** Route context for App Router handlers (params is a Promise in Next 15+). */
export interface RouteContext<P extends Record<string, string> = Record<string, string>> {
  params: Promise<P>;
}

export type ApiHandler<P extends Record<string, string> = Record<string, string>> = (
  req: NextRequest,
  ctx: RouteContext<P>,
) => Promise<unknown>;

/**
 * Wrap a route handler with centralized error handling and JSON serialization.
 * Handlers simply `return { ... }` (or throw one of the ApiError subclasses).
 */
export function withApi<P extends Record<string, string> = Record<string, string>>(
  handler: ApiHandler<P>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return errorResponse(error.status, error.code, error.message);
  }

  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
    return errorResponse(400, "VALIDATION_ERROR", message || "Invalid request body.");
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation -> 409
    if (error.code === "P2002") {
      return errorResponse(409, "CONFLICT", "That record already exists.");
    }
    // Record required but not found -> 404
    if (error.code === "P2025") {
      return errorResponse(404, "NOT_FOUND", "Record not found.");
    }
    // Serialization / write conflict (Serializable transactions on Postgres)
    if (error.code === "P2034") {
      return errorResponse(
        409,
        "CONFLICT",
        "The operation conflicted with a concurrent update. Please try again.",
      );
    }
  }

  console.error("[api] Unhandled error:", error);
  return errorResponse(500, "INTERNAL", "Internal server error.");
}
