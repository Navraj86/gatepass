import type { PoolClient } from "pg";
import { pool } from "../db/client.js";
import { isUniqueViolation } from "../db/errors.js";
import { paymentGateway } from "../payments/gateway.js";

export const CHECKOUT_MINUTES = 15;
export const HOLD_GRACE_MINUTES = 5;

export type CheckoutInput = {
  userId: string;
  eventId: string;
  customer: { email: string; name: string };
  billing: { country: string; zipcode: string };
};

export type CheckoutFailure = "no_holds" | "in_progress" | "payment_unavailable";

export type CheckoutResult =
  | { ok: true; orderId: string; checkoutUrl: string; reused: boolean }
  | { ok: false; reason: CheckoutFailure };

type Prepared =
  | { kind: "created"; orderId: string; amountMinor: number }
  | { kind: "done"; result: CheckoutResult };

export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const prepared = await prepareOrder(input);
  if (prepared.kind === "done") {
    return prepared.result;
  }
  const { orderId, amountMinor } = prepared;

  try {
    const session = await paymentGateway().createCheckout({
      orderId,
      amountMinor,
      customer: input.customer,
      billing: input.billing,
    });
    await pool.query(
      `update orders
       set dodo_session_id = $2, dodo_payment_id = $3, checkout_url = $4, updated_at = now()
       where id = $1`,
      [orderId, session.sessionId, session.paymentId, session.checkoutUrl],
    );
    return { ok: true, orderId, checkoutUrl: session.checkoutUrl, reused: false };
  } catch (err) {
    console.error("Checkout session creation failed", { orderId, err });
    await pool.query(
      `update orders set status = 'failed', failure_code = 'GATEWAY_ERROR', updated_at = now()
       where id = $1 and status = 'pending'`,
      [orderId],
    );
    return { ok: false, reason: "payment_unavailable" };
  }
}

async function prepareOrder({ userId, eventId }: CheckoutInput): Promise<Prepared> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const existing = await client.query<{ id: string; checkout_url: string | null; expired: boolean }>(
      `select id, checkout_url, expires_at <= now() as expired
       from orders
       where user_id = $1 and event_id = $2 and status = 'pending'
       for update`,
      [userId, eventId],
    );
    const current = existing.rows[0];
    if (current && !current.expired) {
      await client.query("commit");
      return current.checkout_url
        ? { kind: "done", result: { ok: true, orderId: current.id, checkoutUrl: current.checkout_url, reused: true } }
        : { kind: "done", result: { ok: false, reason: "in_progress" } };
    }
    if (current) {
      await client.query(`update orders set status = 'expired', updated_at = now() where id = $1`, [current.id]);
    }

    const held = await client.query<{ id: string; price_minor: number }>(
      `select s.id, sec.price_minor
       from seats s
       join sections sec on sec.id = s.section_id
       where s.event_id = $1 and s.held_by = $2
         and s.status = 'available' and s.held_until > now()
       order by s.id
       for update of s`,
      [eventId, userId],
    );
    if (held.rows.length === 0) {
      await client.query("rollback");
      return { kind: "done", result: { ok: false, reason: "no_holds" } };
    }

    const seatIds = held.rows.map((r) => r.id);
    const prices = held.rows.map((r) => r.price_minor);
    const amountMinor = prices.reduce((sum, p) => sum + p, 0);

    const order = await client.query<{ id: string; expires_at: Date }>(
      `insert into orders (user_id, event_id, amount_minor, currency, expires_at)
       select $1, e.id, $3, e.currency, now() + $4::int * interval '1 minute'
       from events e where e.id = $2
       returning id, expires_at`,
      [userId, eventId, amountMinor, CHECKOUT_MINUTES],
    );
    const { id: orderId, expires_at: expiresAt } = order.rows[0];

    await client.query(
      `insert into order_items (order_id, seat_id, price_minor)
       select $1, unnest($2::uuid[]), unnest($3::int[])`,
      [orderId, seatIds, prices],
    );
    await client.query(
      `update seats
       set held_until = $2::timestamptz + $3::int * interval '1 minute', updated_at = now()
       where id = any($1::uuid[])`,
      [seatIds, expiresAt, HOLD_GRACE_MINUTES],
    );

    await client.query("commit");
    return { kind: "created", orderId, amountMinor };
  } catch (err) {
    await client.query("rollback");
    if (isUniqueViolation(err, "orders_one_pending_per_user_event")) {
      return { kind: "done", result: { ok: false, reason: "in_progress" } };
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function releaseOrderHolds(client: PoolClient, orderId: string, userId: string) {
  const { rows } = await client.query<{ id: string }>(
    `update seats
     set held_by = null, held_until = null, updated_at = now()
     where id in (select seat_id from order_items where order_id = $1)
       and held_by = $2 and status = 'available'
     returning id`,
    [orderId, userId],
  );
  return rows.map((r) => r.id);
}

export async function cancelCheckout({ userId, orderId }: { userId: string; orderId: string }) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const cancelled = await client.query(
      `update orders set status = 'cancelled', updated_at = now()
       where id = $1 and user_id = $2 and status = 'pending'
       returning id`,
      [orderId, userId],
    );
    if (cancelled.rowCount === 0) {
      await client.query("rollback");
      return { ok: false as const, released: [] as string[] };
    }
    const released = await releaseOrderHolds(client, orderId, userId);
    await client.query("commit");
    return { ok: true as const, released };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}