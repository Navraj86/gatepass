import { checkoutSchema } from "@gatepass/shared";
import { Router } from "express";
import { z } from "zod";
import { currentUser, requireUser } from "../auth/middleware.js";
import { pool } from "../db/client.js";
import { sendTicketEmail } from "../email/tickets.js";
import { HttpError, parse, sendProblem } from "../http/problem.js";
import { byUser, rateLimit } from "../http/rate-limit.js";
import { type CheckoutFailure, cancelCheckout, startCheckout } from "./checkout.js";

const orderParams = z.object({ orderId: z.uuid() });

const failures: Record<CheckoutFailure, { status: number; detail: string }> = {
  no_holds: { status: 409, detail: "Your seat hold has expired. Please select your seats again" },
  in_progress: { status: 409, detail: "Checkout is being prepared. Try again in a moment" },
  payment_unavailable: { status: 502, detail: "Payments are temporarily unavailable" },
};

const orderLimit = rateLimit("orders", 5, 60, byUser);
const resendLimit = rateLimit("resend-email", 3, 600, byUser);

export const ordersRouter = Router();

ordersRouter.post("/orders", requireUser, orderLimit, async (req, res) => {
  const { eventId, email, name, country, zipcode } = parse(checkoutSchema, req.body, "checkout details");
  const result = await startCheckout({
    userId: currentUser(res).id,
    eventId,
    customer: { email, name },
    billing: { country, zipcode },
  });

  if (!result.ok) {
    const { status, detail } = failures[result.reason];
    sendProblem(res, status, result.reason, detail);
    return;
  }
  res.status(result.reused ? 200 : 201).json({ orderId: result.orderId, checkoutUrl: result.checkoutUrl });
});

ordersRouter.get("/orders/:orderId", requireUser, async (req, res) => {
  const { orderId } = parse(orderParams, req.params, "order id");
  const { rows } = await pool.query(
    `select o.id, o.event_id as "eventId", e.title as "eventTitle", e.venue, e.starts_at as "startsAt",
            o.status, o.amount_minor as "amountMinor", o.currency,
            o.charged_amount_minor as "chargedAmountMinor", o.charged_currency as "chargedCurrency",
            o.failure_code as "failureCode", o.expires_at as "expiresAt", o.paid_at as "paidAt",
            o.created_at as "createdAt"
     from orders o
     join events e on e.id = o.event_id
     where o.id = $1 and o.user_id = $2`,
    [orderId, currentUser(res).id],
  );
  if (rows.length === 0) {
    throw new HttpError(404, "not_found", "Order not found");
  }

  const tickets = await pool.query(
    `select t.id, t.code, t.status, t.scanned_at as "scannedAt", sec.name as "sectionName",
            s.row_label as "rowLabel", s.seat_number as "seatNumber"
     from tickets t
     join seats s on s.id = t.seat_id
     join sections sec on sec.id = s.section_id
     where t.order_id = $1
     order by sec.name, s.row_label, s.seat_number`,
    [orderId],
  );

  res.json({ order: rows[0], tickets: tickets.rows });
});

ordersRouter.post("/orders/:orderId/cancel", requireUser, async (req, res) => {
  const { orderId } = parse(orderParams, req.params, "order id");
  const result = await cancelCheckout({ userId: currentUser(res).id, orderId });
  if (!result.ok) {
    throw new HttpError(409, "not_pending", "This order can no longer be cancelled");
  }
  res.json({ released: result.released });
});

ordersRouter.post("/orders/:orderId/resend-email", requireUser, resendLimit, async (req, res) => {
  const { orderId } = parse(orderParams, req.params, "order id");
  const { rows } = await pool.query(`select 1 from orders where id = $1 and user_id = $2 and status = 'paid'`, [
    orderId,
    currentUser(res).id,
  ]);
  if (rows.length === 0) {
    throw new HttpError(404, "not_found", "No paid order with this id");
  }
  await sendTicketEmail(orderId);
  res.status(202).json({ sent: true });
});
