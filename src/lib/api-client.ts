/**
 * Frontend API client — thin fetch wrapper for the REST layer.
 * Throws `ApiError` (with .status and .code) for non-2xx responses so
 * TanStack Query mutations can branch on status codes (e.g. 409 conflicts).
 */

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = "ERROR",
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const envelope = (data as { error?: { code?: string; message?: string } })?.error;
    throw new ApiClientError(
      response.status,
      envelope?.message ?? `Request failed (${response.status})`,
      envelope?.code ?? "ERROR",
    );
  }

  return data as T;
}
