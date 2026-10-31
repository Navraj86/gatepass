import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth/dev-user.js";
import { pool } from "../db/client.js";
import { holdSeats, MAX_SEATS_PER_USER, releaseHolds, type HoldFailure } from "../holds/holds.js";

const eventParams = z.object({ eventId: z.uuid() });
const holdBody = z.object({
    seatIds: z.array(z.uuid()).min(1).max(MAX_SEATS_PER_USER),
});

const failureStatus: Record<HoldFailure, number> = {
    conflict: 400,
    not_on_sale: 409,
    limit_exceeded: 422
};

const failureMessage: Record<HoldFailure, string> = {
    conflict: "One or more seats were just taken",
    not_on_sale: "This event is not on sale",
    limit_exceeded: `You can hold at most ${MAX_SEATS_PER_USER} seats`,
};

export const seatsRouter = Router();

seatsRouter.get("/events/:eventId/seats", async (req, res) => {
    const params = eventParams.safeParse(req.params);
    if(!params.success) {
        res.status(400).json({ code: "invalid_request", message: "Invalid event id" });
        return;
    }

    const { rows } = await pool.query(
        `select s.id, s.row_label as "rowLabel", s.seat_number as "seatNumber",
                sec.id as "sectionId", sec.name as "sectionName", sec.price_minor as "priceMinor",
                case
                when s.status = 'sold' then 'sold'
                when s.status = 'blocked' then 'blocked'
                when s.held_until > now() then 'held'
                else 'available'
                end as state,
                case when s.held_until > now() then s.held_until end as "heldUntil"
        from seats s
        join sections sec on sec.id = s.section_id
        where s.event_id = $1
        order by sec.name, s.row_label, s.seat_number`,
        [params.data.eventId],
    );

    res.json({ seats: rows });
});

seatsRouter.post("/events/:eventId/holds", requireUser, async (req, res) => {
    const params = eventParams.safeParse(req.params);
    const body = holdBody.safeParse(req.body);

    if(!params.success || !body.success) {
        res.status(400).json({ code: "invalid_request", message: "Invalid event id or seat list" });
        return;
    }

    const result = await holdSeats({
        userId: res.locals.userId,
        eventId: params.data.eventId,
        seatIds: body.data.seatIds
    });

    if (!result.ok) {
        res.status(failureStatus[result.reason]).json({
            code: result.reason,
            message: failureMessage[result.reason],
        });
        return;
    }

    res.status(201).json({ seatIds: result.seatIds, heldUntil: result.heldUntil });
});

seatsRouter.delete("/events/:eventId/holds", requireUser, async (req, res) => {
    const params = eventParams.safeParse(req.params);
    if(!params.success) {
        res.status(400).json({ code: "invalid_request", message: "Invalid event id" });
        return;
    }

    const released = await releaseHolds({ userId: res.locals.userId, eventId: params.data.eventId });
    res.json(released);
});
