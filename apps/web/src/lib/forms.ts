import { ApiError } from "./api";

export type FieldErrors = Record<string, string>;

type Issue = { path: PropertyKey[] | string; message: string };

/** First message per field, from a Zod error (client side) or the API's problem+json `errors`. */
export function fieldErrors(source: unknown): FieldErrors {
  let issues: Issue[] = [];
  if (source instanceof ApiError && Array.isArray(source.body.errors)) issues = source.body.errors as Issue[];
  else if (source && typeof source === "object" && "issues" in source && Array.isArray(source.issues)) {
    issues = source.issues as Issue[];
  }
  const errors: FieldErrors = {};
  for (const { path, message } of issues) {
    errors[Array.isArray(path) ? path.map(String).join(".") : path] ??= message;
  }
  return errors;
}
