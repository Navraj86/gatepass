import { randomBytes } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.js";
import { isUniqueViolation } from "../db/errors.js";
import { releaseOrderHolds } from "../orders/checkout.js";
import { requestRefund } from "../orders/refund.js";

const paymentSucceededData = z.object({
  payment_id: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  total_amount: z.number().int(),
  tax: z.number().int().nullish(),
  currency: z.string(),
  settlement_amount: z.number().int(),
  settlement_tax: z.number().int().nullish(),
  settlement_currency: z.string(),
});

export const webhookEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("payment.succeeded"), data: paymentSucceededData }),
  z.object({
    type: z.literal("payment.failed"),
    data: z.object({ payment_id: z.string(), error_code: z.string().nullish() }),
  }),
  z.object({ type: z.literal("payment.cancelled"), data: z.object({ payment_id: z.string() }) }),
  z.object({
    type: z.literal("refund.succeeded"),
    data: z.object({ refund_id: z.string(), payment_id: z.string() }),
  }),
  z.object({
    type: z.literal("refund.failed"),
    data: z.object({ refund_id: z.string(), payment_id: z.string() }),
  }),
]);

export type WebhookEvent = z.infer<typeof webhookEvent>;
type PaymentSucceededData = z.infer<typeof paymentSucceededData>;

export type WebhookOutcome =
  | "fulfilled"
  | "duplicate"
  | "refunding"
  | "failed"
  | "cancelled"
  | "refunded"
  | "ignored";

const CLAIMABLE = ["pending", "expired", "cancelled", "failed"];

export async function processWebhook(event: WebhookEvent): Promise<WebhookOutcome> {
  switch (event.type) {
    case "payment.succeeded":
      return fulfillPayment(event.data);

    case "payment.failed": {
      const result = await pool.query(
        `update orders set status = 'failed', failure_code = $2, updated_at = now()
         where dodo_payment_id = $1 and status = 'pending'`,
        [event.data.payment_id, event.data.error_code ?? "UNKNOWN"],
      );
      return result.rowCount ? "failed" : "ignored";
    }

    case "payment.cancelled":
      return cancelByPayment(event.data.payment_id);

    case "refund.succeeded": {
      const result = await pool.query(
        `update orders set status = 'refunded', updated_at = now()
         where dodo_payment_id = $1 and status = 'refunding'`,
        [event.data.payment_id],
      );
      return result.rowCount ? "refunded" : "ignored";
    }

    case "refund.failed":
      console.error("Refund failed at the provider", event.data);
      return "ignored";
  }
}

async function fulfillPayment(data: PaymentSucceededData): Promise<WebhookOutcome> {
  const result = await fulfillInTransaction(data);
  if (result.refundOrderId) {
    await requestRefund(result.refundOrderId);
  }
  return result.outcome;
}

async function fulfillInTransaction(
  data: PaymentSucceededData,
): Promise<{ outcome: WebhookOutcome; refundOrderId?: string }> {
  const client = await pool.connect();
  let orderId: string | undefined;
  try {
    await client.query("begin");

    const found = await client.query<{
      id: string;
      user_id: string;
      event_id: string;
      status: string;
      amount_minor: number;
      currency: string;
    }>(
      `select id, user_id, event_id, status, amount_minor, currency
       from orders where dodo_payment_id = $1 for update`,
      [data.payment_id],
    );
    const order = found.rows[0];
    if (!order) {
      await client.query("rollback");
      console.warn("payment.succeeded for an unknown payment", data.payment_id);
      return { outcome: "ignored" };
    }
    orderId = order.id;

    if (!CLAIMABLE.includes(order.status)) {
      await client.query("rollback");
      return { outcome: "duplicate" };
    }

    const netAmount = data.settlement_amount - (data.settlement_tax ?? 0);
    if (
      data.metadata?.order_id !== order.id ||
      data.settlement_currency !== order.currency ||
      netAmount !== order.amount_minor
    ) {
      await client.query("rollback");
      console.error("payment.succeeded does not match its order", { orderId: order.id });
      return { outcome: "ignored" };
    }

    await client.query(
      `update orders
       set status = 'paid', paid_at = now(), charged_amount_minor = $2,
           charged_currency = $3, charged_tax_minor = $4, updated_at = now()
       where id = $1`,
      [order.id, data.total_amount, data.currency, data.tax ?? null],
    );

    await client.query("savepoint claim_seats");
    const items = await client.query(`select seat_id from order_items where order_id = $1`, [order.id]);
    const claimed = await client.query<{ id: string }>(
      `update seats
       set status = 'sold', held_by = null, held_until = null, updated_at = now()
       where id in (select seat_id from order_items where order_id = $1)
         and held_by = $2 and status = 'available'
       returning id`,
      [order.id, order.user_id],
    );

    if (claimed.rows.length !== items.rows.length) {
      await client.query("rollback to savepoint claim_seats");
      await client.query(`update orders set status = 'refunding', updated_at = now() where id = $1`, [order.id]);
      await client.query("commit");
      console.error("A seat was lost before payment arrived; refunding", { orderId: order.id });
      return { outcome: "refunding", refundOrderId: order.id };
    }

    const seatIds = claimed.rows.map((r) => r.id);
    const codes = seatIds.map(() => randomBytes(16).toString("base64url"));
    await client.query(
      `insert into tickets (order_id, event_id, seat_id, code)
       select $1, $2, unnest($3::uuid[]), unnest($4::text[])`,
      [order.id, order.event_id, seatIds, codes],
    );

    await client.query("commit");
    return { outcome: "fulfilled" };
  } catch (err) {
    await client.query("rollback");
    if (orderId && isUniqueViolation(err, "tickets_one_valid_per_seat")) {
      console.error("Oversell blocked by tickets_one_valid_per_seat", { orderId });
      await pool.query(
        `update orders
         set status = 'refunding', paid_at = now(), charged_amount_minor = $2,
             charged_currency = $3, charged_tax_minor = $4, updated_at = now()
         where id = $1 and status = any($5::order_status[])`,
        [orderId, data.total_amount, data.currency, data.tax ?? null, CLAIMABLE],
      );
      return { outcome: "refunding", refundOrderId: orderId };
    }
    throw err;
  } finally {
    client.release();
  }
}

async function cancelByPayment(paymentId: string): Promise<WebhookOutcome> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const cancelled = await client.query<{ id: string; user_id: string }>(
      `update orders set status = 'cancelled', updated_at = now()
       where dodo_payment_id = $1 and status in ('pending', 'failed')
       returning id, user_id`,
      [paymentId],
    );
    const order = cancelled.rows[0];
    if (!order) {
      await client.query("rollback");
      return "ignored";
    }
    await releaseOrderHolds(client, order.id, order.user_id);
    await client.query("commit");
    return "cancelled";
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
