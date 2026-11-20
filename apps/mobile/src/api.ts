import { API_URL } from "./config";
import type { User } from "./types";

/** An error the screens can show as-is: `message` is the server's own wording when it sent one. */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Options = { token?: string | null; method?: "GET" | "POST"; body?: unknown };

async function request(path: string, { token, method = "GET", body }: Options = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      // No cookies at all: the session travels only in the Authorization header. Without this,
      // the phone's networking layer would store the cookie too, and the API's cookie checks
      // (which expect a browser on gatepass.navraj.dev) would start refusing requests.
      credentials: "omit",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach Gatepass. Check the phone's connection and try again.");
  }

  if (!res.ok) {
    // The API answers errors as problem+json ({ code, detail }); Better Auth uses { code, message }.
    const problem = (await res.json().catch(() => ({}))) as { code?: string; detail?: string; message?: string };
    throw new ApiError(
      res.status,
      problem.code ?? "error",
      problem.detail ?? problem.message ?? `Something went wrong (${res.status}).`,
    );
  }
  return res;
}

/** GET or POST a JSON endpoint and return the parsed body. */
export async function api<T>(path: string, options?: Options): Promise<T> {
  const res = await request(path, options);
  return (await res.json()) as T;
}

/**
 * Signs in with email and password. The server sends the session token back in the
 * `set-auth-token` header (Better Auth's bearer plugin); the app keeps it and sends it
 * with every later request.
 */
export async function signIn(email: string, password: string): Promise<string> {
  const res = await request("/api/auth/sign-in/email", { method: "POST", body: { email, password } });
  const token = res.headers.get("set-auth-token");
  if (!token) throw new ApiError(500, "no_token", "Signed in, but the server sent no token. Try again.");
  return token;
}

/** Ends the session on the server too, so the token stops working everywhere. */
export async function signOut(token: string): Promise<void> {
  await request("/api/auth/sign-out", { method: "POST", token, body: {} }).catch(() => {});
}

export async function fetchMe(token: string): Promise<User> {
  const { user } = await api<{ user: User }>("/api/me", { token });
  return user;
}
