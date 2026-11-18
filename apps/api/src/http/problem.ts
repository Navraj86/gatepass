import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

/**
 * Every error leaves the API as application/problem+json (RFC 9457) with a
 * stable `code`, so the web app and k6 can tell a seat conflict from a failure.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const titles: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

export function sendProblem(
  res: Response,
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  res
    .status(status)
    .type("application/problem+json")
    .json({ type: "about:blank", title: titles[status] ?? "Error", status, code, detail, ...extra });
}

export function parse<T extends z.ZodType>(schema: T, value: unknown, what = "request"): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "invalid_request", `Invalid ${what}`, {
      errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

export function notFound(_req: Request, res: Response) {
  sendProblem(res, 404, "not_found", "No such endpoint");
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    sendProblem(res, err.status, err.code, err.message, err.extra);
    return;
  }
  if (isBodyParserError(err)) {
    sendProblem(res, 400, "invalid_body", "Request body is not valid JSON");
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  if (!req.log) console.error(err);
  sendProblem(res, 500, "internal_error", "Something went wrong");
}

function isBodyParserError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed";
}
