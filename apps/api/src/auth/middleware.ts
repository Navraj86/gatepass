import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { pool } from "../db/client.js";
import { type UserRole, userRoles } from "../db/schema.js";
import { HttpError } from "../http/problem.js";
import { auth } from "./auth.js";

export type SessionUser = { id: string; email: string; name: string; role: UserRole };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: SessionUser;
      userId?: string;
    }
  }
}

async function resolveUser(req: Request): Promise<SessionUser | undefined> {
  if (config.DEV_AUTH) {
    const id = req.header("x-user-id");
    if (id) {
      const role = req.header("x-user-role") as UserRole | undefined;
      return { id, email: `${id}@dev.local`, name: id, role: role && userRoles.includes(role) ? role : "attendee" };
    }
  }
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!result) return undefined;
  const { id, email, name, role } = result.user as typeof result.user & { role?: string };
  return { id, email, name, role: userRoles.includes(role as UserRole) ? (role as UserRole) : "attendee" };
}

/** Resolves the session once per request; 401 without one. */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = res.locals.user ?? (await resolveUser(req));
  if (!user) {
    throw new HttpError(401, "unauthorized", "Sign in to continue");
  }
  res.locals.user = user;
  res.locals.userId = user.id;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireUser(req, res, () => {});
    if (!roles.includes(res.locals.user!.role)) {
      throw new HttpError(403, "forbidden", "You do not have access to this");
    }
    next();
  };
}

/**
 * Checks the row, not just the role: the caller must own this event. A
 * foreign event answers 404, so ids cannot be probed by changing the URL.
 */
export async function requireEventOwner(req: Request, res: Response, next: NextFunction) {
  await requireRole("organizer")(req, res, () => {});
  const { rows } = await pool.query(`select 1 from events where id = $1 and organizer_id = $2`, [
    eventIdParam(req),
    res.locals.userId,
  ]);
  if (rows.length === 0) {
    throw new HttpError(404, "not_found", "Event not found");
  }
  next();
}

/** Staff assigned to the event, or the event's own organizer, may scan it. */
export async function requireEventStaff(req: Request, res: Response, next: NextFunction) {
  await requireRole("staff", "organizer")(req, res, () => {});
  const eventId = eventIdParam(req) ?? req.body?.eventId;
  const { rows } = await pool.query(
    `select 1 from events e
     where e.id = $1
       and (e.organizer_id = $2
            or exists (select 1 from event_staff s where s.event_id = e.id and s.user_id = $2))`,
    [eventId, res.locals.userId],
  );
  if (rows.length === 0) {
    throw new HttpError(403, "forbidden", "You are not assigned to this event");
  }
  next();
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function eventIdParam(req: Request): string | undefined {
  const id = req.params.eventId ?? req.body?.eventId;
  if (typeof id !== "string" || !uuidPattern.test(id)) {
    throw new HttpError(400, "invalid_request", "Invalid event id");
  }
  return id;
}

/** The signed-in user; only call after requireUser or requireRole. */
export function currentUser(res: Response): SessionUser {
  if (!res.locals.user) {
    throw new HttpError(401, "unauthorized", "Sign in to continue");
  }
  return res.locals.user;
}
