import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth/dev-user.js";
import { pool } from "../db/client.js";
import { holdSeats, MAX_SEATS_PER_USER, releaseHolds, type HoldFailure } from "../holds/holds.js";
import { HttpError, parse, sendProblem } from "../http/problem.js";
import { byUser, rateLimit } from "../http/rate-limit.js";
import { streamSeats } from "../live/stream.js";
import { seatHolds } from "../observability/metrics.js";
import { readSeatMap } from "./seat-map.js";

const eventParams = z.object({ eventId: z.uuid() });
const holdBody = z.object({
  seatIds: z.array(z.uuid()).min(1).max(MAX_SEATS_PER_USER),
});

const failures: Record<HoldFailure, { status: number; detail: string }> = {
  conflict: { status: 409, detail: "One or more seats were just taken" },
  not_on_sale: { status: 403, detail: "This event is not on sale" },
  limit_exceeded: { status: 422, detail: `You can hold at most ${MAX_SEATS_PER_USER} seats` },
};

const metricResult: Record<HoldFailure, string> = {
  conflict: "conflict",
  not_on_sale: "not_on_sale",
  limit_exceeded: "limit",
};

const holdLimit = rateLimit("holds", 10, 60, byUser);

export const seatsRouter = Router();

const publicEventColumns = `
  e.id, e.title, e.description, e.venue, e.starts_at as "startsAt",
  e.sale_starts_at as "saleStartsAt", e.status, e.currency`;

seatsRouter.get("/events", async (_req, res) => {
  const { rows } = await pool.query(
    `select ${publicEventColumns},
            (select min(price_minor) from sections where event_id = e.id) as "fromPriceMinor"
     from events e
     where e.status = 'published' and e.starts_at > now() - interval '1 day'
     order by e.starts_at`,
  );
  res.json({ events: rows });
});

async function requirePublicEvent(eventId: string) {
  const { rows } = await pool.query(
    `select ${publicEventColumns} from events e where e.id = $1 and e.status <> 'draft'`,
    [eventId],
  );
  if (rows.length === 0) {
    throw new HttpError(404, "not_found", "Event not found");
  }
  return rows[0];
}

seatsRouter.get("/events/:eventId", async (req, res) => {
  const { eventId } = parse(eventParams, req.params, "event id");
  const event = await requirePublicEvent(eventId);
  const sections = await pool.query(
    `select id, name, price_minor as "priceMinor"
     from sections where event_id = $1
     order by price_minor desc, name`,
    [eventId],
  );
  res.json({ event, sections: sections.rows });
});

seatsRouter.get("/events/:eventId/seats", async (req, res) => {
  const { eventId } = parse(eventParams, req.params, "event id");
  await requirePublicEvent(eventId);
  res.json({ seats: await readSeatMap(eventId) });
});

seatsRouter.get("/events/:eventId/seats/stream", async (req, res) => {
  const { eventId } = parse(eventParams, req.params, "event id");
  await requirePublicEvent(eventId);
  await streamSeats(req, res, eventId);
});

seatsRouter.post("/events/:eventId/holds", requireUser, holdLimit, async (req, res) => {
  const { eventId } = parse(eventParams, req.params, "event id");
  const { seatIds } = parse(holdBody, req.body, "seat list");

  const result = await holdSeats({ userId: res.locals.userId, eventId, seatIds });
  if (!result.ok) {
    seatHolds.inc({ result: metricResult[result.reason] });
    const { status, detail } = failures[result.reason];
    sendProblem(res, status, result.reason, detail);
    return;
  }

  seatHolds.inc({ result: "success" });
  res.status(201).json({ seatIds: result.seatIds, heldUntil: result.heldUntil });
});

seatsRouter.get("/events/:eventId/holds", requireUser, async (req, res) => {
  const { eventId } = parse(eventParams, req.params, "event id");
  const { rows } = await pool.query(
    `select id as "seatId", held_until as "heldUntil" from seats
     where event_id = $1 and held_by = $2 and status = 'available' and held_until > now()`,
    [eventId, res.locals.userId],
  );
  res.json({ holds: rows });
});

seatsRouter.delete("/events/:eventId/holds", requireUser, async (req, res) => {
  const { eventId } = parse(eventParams, req.params, "event id");
  const released = await releaseHolds({ userId: res.locals.userId, eventId });
  res.json({ released });
});
