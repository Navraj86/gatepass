import {
  assignStaffSchema,
  createEventSchema,
  createSectionSchema,
  MAX_SEATS_PER_EVENT,
  publishEventSchema,
  updateEventSchema,
} from "@gatepass/shared";
import { Router } from "express";
import { z } from "zod";
import { currentUser, requireEventOwner, requireRole } from "../auth/middleware.js";
import { pool } from "../db/client.js";
import { seatGrid } from "../events/seat-grid.js";
import { HttpError, parse } from "../http/problem.js";
import { refundByOrganizer } from "../orders/refund.js";

export const organizerRouter = Router();
organizerRouter.use("/organizer", requireRole("organizer"));

const eventParams = z.object({ eventId: z.uuid() });
const sectionParams = z.object({ eventId: z.uuid(), sectionId: z.uuid() });

const eventColumns = `
  e.id, e.title, e.description, e.venue, e.starts_at as "startsAt",
  e.sale_starts_at as "saleStartsAt", e.status, e.currency, e.created_at as "createdAt"`;

async function readEvent(eventId: string) {
  const { rows } = await pool.query(`select ${eventColumns} from events e where e.id = $1`, [eventId]);
  return rows[0];
}

async function requireDraft(eventId: string) {
  const { rows } = await pool.query<{ status: string }>(`select status from events where id = $1`, [eventId]);
  if (rows[0]?.status !== "draft") {
    throw new HttpError(409, "not_draft", "Only draft events can be changed");
  }
}

organizerRouter.get("/organizer/events", async (_req, res) => {
  const { rows } = await pool.query(
    `select ${eventColumns},
            (select count(*)::int from seats s where s.event_id = e.id) as "seatCount",
            (select count(*)::int from seats s where s.event_id = e.id and s.status = 'sold') as "soldCount"
     from events e
     where e.organizer_id = $1
     order by e.starts_at desc`,
    [currentUser(res).id],
  );
  res.json({ events: rows });
});

organizerRouter.post("/organizer/events", async (req, res) => {
  const input = parse(createEventSchema, req.body, "event");
  const { rows } = await pool.query<{ id: string }>(
    `insert into events (organizer_id, title, description, venue, starts_at, sale_starts_at)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [currentUser(res).id, input.title, input.description ?? null, input.venue, input.startsAt, input.saleStartsAt],
  );
  res.status(201).json({ event: await readEvent(rows[0].id) });
});

organizerRouter.get("/organizer/events/:eventId", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, req.params);
  const sections = await pool.query(
    `select sec.id, sec.name, sec.price_minor as "priceMinor",
            count(s.id)::int as "seatCount",
            count(distinct s.row_label)::int as "rowCount",
            min(s.row_label) as "firstRow", max(s.row_label) as "lastRow"
     from sections sec
     left join seats s on s.section_id = sec.id
     where sec.event_id = $1
     group by sec.id
     order by sec.price_minor desc, sec.name`,
    [eventId],
  );
  res.json({ event: await readEvent(eventId), sections: sections.rows });
});

organizerRouter.patch("/organizer/events/:eventId", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, req.params);
  const input = parse(updateEventSchema, req.body, "event");
  await requireDraft(eventId);

  const columns: Record<string, string> = {
    title: "title",
    description: "description",
    venue: "venue",
    startsAt: "starts_at",
    saleStartsAt: "sale_starts_at",
  };
  const entries = Object.entries(input).filter(([, v]) => v !== undefined);
  if (entries.length > 0) {
    const sets = entries.map(([k], i) => `${columns[k]} = $${i + 2}`);
    await pool.query(`update events set ${sets.join(", ")}, updated_at = now() where id = $1`, [
      eventId,
      ...entries.map(([, v]) => v),
    ]);
  }

  const event = await readEvent(eventId);
  if (new Date(event.saleStartsAt) >= new Date(event.startsAt)) {
    throw new HttpError(422, "invalid_dates", "Sales must open before the event starts");
  }
  res.json({ event });
});

/** Adds a section and generates its seats; rows continue after the event's last row. */
organizerRouter.post("/organizer/events/:eventId/sections", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, req.params);
  const input = parse(createSectionSchema, req.body, "section");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const event = await client.query<{ status: string }>(`select status from events where id = $1 for update`, [
      eventId,
    ]);
    if (event.rows[0]?.status !== "draft") {
      throw new HttpError(409, "not_draft", "Only draft events can be changed");
    }

    const existing = await client.query<{ seats: number; rows: number }>(
      `select count(*)::int as seats, count(distinct (section_id, row_label))::int as rows
       from seats where event_id = $1`,
      [eventId],
    );
    const added = input.rows * input.seatsPerRow;
    if (existing.rows[0].seats + added > MAX_SEATS_PER_EVENT) {
      throw new HttpError(422, "too_many_seats", `An event can have at most ${MAX_SEATS_PER_EVENT} seats`);
    }

    const section = await client.query<{ id: string }>(
      `insert into sections (event_id, name, price_minor) values ($1, $2, $3) returning id`,
      [eventId, input.name, input.priceMinor],
    );
    const sectionId = section.rows[0].id;
    const grid = seatGrid(input.rows, input.seatsPerRow, existing.rows[0].rows);
    await client.query(
      `insert into seats (event_id, section_id, row_label, seat_number)
       select $1, $2, unnest($3::text[]), unnest($4::int[])`,
      [eventId, sectionId, grid.map((g) => g.rowLabel), grid.map((g) => g.seatNumber)],
    );
    await client.query("commit");
    res
      .status(201)
      .json({ section: { id: sectionId, name: input.name, priceMinor: input.priceMinor, seatCount: added } });
  } catch (err) {
    await client.query("rollback");
    if (typeof err === "object" && err && "constraint" in err && err.constraint === "sections_event_name_unique") {
      throw new HttpError(409, "duplicate_section", "A section with this name already exists");
    }
    throw err;
  } finally {
    client.release();
  }
});

organizerRouter.delete("/organizer/events/:eventId/sections/:sectionId", requireEventOwner, async (req, res) => {
  const { eventId, sectionId } = parse(sectionParams, req.params);
  await requireDraft(eventId);
  const { rowCount } = await pool.query(`delete from sections where id = $1 and event_id = $2`, [sectionId, eventId]);
  if (!rowCount) throw new HttpError(404, "not_found", "Section not found");
  res.status(204).end();
});

organizerRouter.post("/organizer/events/:eventId/publish", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, req.params);
  const { saleStartsAt } = parse(publishEventSchema, req.body ?? {});
  await requireDraft(eventId);

  const seats = await pool.query<{ count: number }>(`select count(*)::int as count from seats where event_id = $1`, [
    eventId,
  ]);
  if (seats.rows[0].count === 0) {
    throw new HttpError(422, "no_seats", "Add at least one section before publishing");
  }

  const { rowCount } = await pool.query(
    `update events
     set status = 'published', sale_starts_at = coalesce($2, sale_starts_at), updated_at = now()
     where id = $1 and status = 'draft' and coalesce($2, sale_starts_at) < starts_at`,
    [eventId, saleStartsAt ?? null],
  );
  if (!rowCount) {
    throw new HttpError(422, "invalid_dates", "Sales must open before the event starts");
  }
  res.json({ event: await readEvent(eventId) });
});

organizerRouter.get("/organizer/events/:eventId/stats", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, req.params);
  const { rows } = await pool.query(
    `select
       (select count(*)::int from seats where event_id = $1) as "totalSeats",
       (select count(*)::int from seats where event_id = $1 and status = 'sold') as "sold",
       (select count(*)::int from seats
          where event_id = $1 and status = 'available' and held_until > now()) as "held",
       (select coalesce(sum(amount_minor), 0)::int from orders
          where event_id = $1 and status = 'paid') as "revenueMinor",
       (select count(*)::int from tickets
          where event_id = $1 and status = 'valid' and scanned_at is not null) as "checkedIn",
       (select count(*)::int from tickets where event_id = $1 and status = 'valid') as "validTickets",
       (select count(*)::int from orders where event_id = $1 and status = 'paid') as "paidOrders",
       (select count(*)::int from orders where event_id = $1 and status = 'refunding') as "refundingOrders"`,
    [eventId],
  );
  res.json({ stats: rows[0] });
});

const refundFailures = {
  not_found: { status: 404, detail: "Order not found" },
  not_refundable: { status: 409, detail: "Only paid orders can be refunded" },
  ticket_scanned: { status: 409, detail: "A ticket in this order was already scanned" },
} as const;

organizerRouter.post("/organizer/orders/:orderId/refund", async (req, res) => {
  const { orderId } = parse(z.object({ orderId: z.uuid() }), req.params, "order id");
  const result = await refundByOrganizer({ orderId, organizerId: currentUser(res).id });
  if (!result.ok) {
    const { status, detail } = refundFailures[result.reason];
    throw new HttpError(status, result.reason, detail);
  }
  const { rows } = await pool.query(`select id, status from orders where id = $1`, [orderId]);
  res.json({ order: rows[0] });
});

const ordersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(["pending", "paid", "expired", "cancelled", "failed", "refunding", "refunded"]).optional(),
});
const PAGE_SIZE = 25;

organizerRouter.get("/organizer/events/:eventId/orders", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, req.params);
  const { page, status } = parse(ordersQuery, req.query, "query");
  const { rows } = await pool.query(
    `select o.id, o.status, o.amount_minor as "amountMinor", o.currency, o.created_at as "createdAt",
            o.paid_at as "paidAt", u.name as "buyerName", u.email as "buyerEmail",
            (select count(*)::int from order_items i where i.order_id = o.id) as "seatCount",
            (select count(*)::int from tickets t where t.order_id = o.id and t.scanned_at is not null) as "scannedCount",
            count(*) over ()::int as "total"
     from orders o
     join "user" u on u.id = o.user_id
     where o.event_id = $1 and ($2::order_status is null or o.status = $2)
     order by o.created_at desc
     limit $3 offset $4`,
    [eventId, status ?? null, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  const total = rows[0]?.total ?? 0;
  res.json({
    orders: rows.map(({ total: _total, ...o }) => o),
    page,
    pageSize: PAGE_SIZE,
    total,
  });
});

organizerRouter.get("/organizer/events/:eventId/staff", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, req.params);
  const { rows } = await pool.query(
    `select u.id, u.name, u.email from event_staff s join "user" u on u.id = s.user_id
     where s.event_id = $1 order by u.name`,
    [eventId],
  );
  res.json({ staff: rows });
});

organizerRouter.post("/organizer/events/:eventId/staff", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, req.params);
  const { email } = parse(assignStaffSchema, req.body, "staff email");
  const found = await pool.query<{ id: string; name: string; email: string; role: string }>(
    `select id, name, email, role from "user" where email = $1`,
    [email.toLowerCase()],
  );
  const staff = found.rows[0];
  if (staff?.role !== "staff") {
    throw new HttpError(422, "not_staff", "No staff account with this email");
  }
  await pool.query(`insert into event_staff (event_id, user_id) values ($1, $2) on conflict do nothing`, [
    eventId,
    staff.id,
  ]);
  res.status(201).json({ staff: { id: staff.id, name: staff.name, email: staff.email } });
});

organizerRouter.delete("/organizer/events/:eventId/staff/:userId", requireEventOwner, async (req, res) => {
  const { eventId } = parse(eventParams, { eventId: req.params.eventId });
  await pool.query(`delete from event_staff where event_id = $1 and user_id = $2`, [eventId, req.params.userId]);
  res.status(204).end();
});
