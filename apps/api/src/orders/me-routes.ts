import { Router } from "express";
import { currentUser, requireUser } from "../auth/middleware.js";
import { pool } from "../db/client.js";

export const meRouter = Router();

meRouter.get("/me/tickets", requireUser, async (_req, res) => {
  const { rows } = await pool.query(
    `select t.id, t.code, t.status, t.scanned_at as "scannedAt", t.order_id as "orderId",
            e.id as "eventId", e.title as "eventTitle", e.venue, e.starts_at as "startsAt",
            sec.name as "sectionName", s.row_label as "rowLabel", s.seat_number as "seatNumber"
     from tickets t
     join orders o on o.id = t.order_id
     join events e on e.id = t.event_id
     join seats s on s.id = t.seat_id
     join sections sec on sec.id = s.section_id
     where o.user_id = $1
     order by e.starts_at, sec.name, s.row_label, s.seat_number`,
    [currentUser(res).id],
  );
  res.json({ tickets: rows });
});

meRouter.get("/me/orders", requireUser, async (_req, res) => {
  const { rows } = await pool.query(
    `select o.id, o.status, o.amount_minor as "amountMinor", o.currency, o.created_at as "createdAt",
            e.id as "eventId", e.title as "eventTitle", e.starts_at as "startsAt",
            (select count(*)::int from order_items i where i.order_id = o.id) as "seatCount"
     from orders o join events e on e.id = o.event_id
     where o.user_id = $1 and o.status in ('paid', 'refunding', 'refunded', 'pending')
     order by o.created_at desc
     limit 50`,
    [currentUser(res).id],
  );
  res.json({ orders: rows });
});
