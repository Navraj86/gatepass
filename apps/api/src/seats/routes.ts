import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth/dev-user.js";
import { pool } from "../db/client.js";
import { holdSeats, MAX_SEATS_PER_USER, releaseHolds, type HoldFailure } from "../holds/holds.js";
import { parse, sendProblem } from "../http/problem.js";
import { seatHolds } from "../observability/metrics.js";

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

export const seatsRouter = Router();

seatsRouter.get("/events/:eventId/seats", async (req, res) => {
  const { eventId } = parse(eventParams, req.params, "event id");
  const { rows } = await pool.query(
    `select s.id, s.row_label as "rowLabel", s.seat_number as "seatNumber",
            sec.id as "sectionId", sec.name as "sectionName", sec.price_minor as "priceMinor",
            case
              when s.status = 'sold' then 'sold'
              when s.status = 'blocked' then 'blocked'
              when s.held_until > now() then 'held'
              else 'available'
            end as state,
            case when s.status = 'available' and s.held_until > now() then s.held_until end as "heldUntil"
     from seats s
     join sections sec on sec.id = s.section_id
     where s.event_id = $1
     order by sec.name, s.row_label, s.seat_number`,
    [eventId],
  );
  res.json({ seats: rows });
});

seatsRouter.post("/events/:eventId/holds", requireUser, async (req, res) => {
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

seatsRouter.delete("/events/:eventId/holds", requireUser, async (req, res) => {
  const { eventId } = parse(eventParams, req.params, "event id");
  const released = await releaseHolds({ userId: res.locals.userId, eventId });
  res.json({ released });
});
