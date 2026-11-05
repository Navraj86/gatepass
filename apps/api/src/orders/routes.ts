import { Router } from "express";
import { z } from "zod";
import { requireUser } from "../auth/dev-user.js";
import { pool } from "../db/client.js";
import { cancelCheckout, startCheckout, type CheckoutFailure } from "./checkout.js";

const checkoutBody = z.object({
  eventId: z.uuid(),
  email: z.email(),
  name: z.string().min(1).max(100),
  country: z.string().regex(/^[A-Z]{2}$/),
  zipcode: z.string().min(3).max(12),
});

const orderParams = z.object({ orderId: z.uuid() });

const failure: Record<CheckoutFailure, { status: number; message: string }> = {
  no_holds: { status: 409, message: "Your seat hold has expired. Please select your seats again" },
  in_progress: { status: 409, message: "Checkout is being prepared. Try again in a moment" },
  payment_unavailable: { status: 502, message: "Payments are temporarily unavailable" },
};

export const ordersRouter = Router();

ordersRouter.post("/orders", requireUser, async (req, res) => {
  const body = checkoutBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ code: "invalid_request", message: "Invalid checkout details" });
    return;
  }

  const { eventId, email, name, country, zipcode } = body.data;
  const result = await startCheckout({
    userId: res.locals.userId,
    eventId,
    customer: { email, name },
    billing: { country, zipcode },
  });

  if (!result.ok) {
    const { status, message } = failure[result.reason];
    res.status(status).json({ code: result.reason, message });
    return;
  }

  res.status(result.reused ? 200 : 201).json({ orderId: result.orderId, checkoutUrl: result.checkoutUrl });
});

ordersRouter.get("/orders/:orderId", requireUser, async (req, res) => {
  const params = orderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "invalid_request", message: "Invalid order id" });
    return;
  }

  const { rows } = await pool.query(
    `select id, event_id as "eventId", status, amount_minor as "amountMinor", currency,
            charged_amount_minor as "chargedAmountMinor", charged_currency as "chargedCurrency",
            failure_code as "failureCode", expires_at as "expiresAt"
     from orders where id = $1 and user_id = $2`,
    [params.data.orderId, res.locals.userId],
  );
  if (rows.length === 0) {
    res.status(404).json({ code: "not_found", message: "Order not found" });
    return;
  }

  const tickets = await pool.query(
    `select t.code, t.status, sec.name as "sectionName", s.row_label as "rowLabel",
            s.seat_number as "seatNumber"
     from tickets t
     join seats s on s.id = t.seat_id
     join sections sec on sec.id = s.section_id
     where t.order_id = $1
     order by sec.name, s.row_label, s.seat_number`,
    [params.data.orderId],
  );

  res.json({ order: rows[0], tickets: tickets.rows });
});

ordersRouter.post("/orders/:orderId/cancel", requireUser, async (req, res) => {
  const params = orderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ code: "invalid_request", message: "Invalid order id" });
    return;
  }

  const result = await cancelCheckout({ userId: res.locals.userId, orderId: params.data.orderId });
  if (!result.ok) {
    res.status(409).json({ code: "not_pending", message: "This order can no longer be cancelled" });
    return;
  }
  res.json({ released: result.released });
});