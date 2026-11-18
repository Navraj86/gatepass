import { pool } from "../db/client.js";
import { announceSeats } from "../live/announce.js";
import { logger } from "../observability/logger.js";
import { refundFailures } from "../observability/metrics.js";
import { paymentGateway } from "../payments/gateway.js";

export async function requestRefund(orderId: string, reason = "Seat no longer available") {
  const { rows } = await pool.query<{ dodo_payment_id: string | null }>(
    `select dodo_payment_id from orders where id = $1 and status = 'refunding'`,
    [orderId],
  );
  const paymentId = rows[0]?.dodo_payment_id;
  if (!paymentId) {
    return;
  }

  try {
    const result = await paymentGateway().refund({ paymentId, orderId, reason });
    if (result.status === "requested") {
      await pool.query(`update orders set dodo_refund_id = $2, updated_at = now() where id = $1`, [
        orderId,
        result.refundId,
      ]);
    }
  } catch (err) {
    refundFailures.inc();
    logger.error({ err, orderId }, "Refund request failed; order stays refunding");
  }
}
export type OrganizerRefundResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_refundable" | "ticket_scanned" };

/**
 * One transaction puts the order into refunding, its tickets to refunded and
 * its seats back on sale; then the provider refund is requested and
 * refund.succeeded finishes the job. Calling it again on a refunding order
 * retries the provider call, so the button is safe to press twice.
 */
export async function refundByOrganizer({
  orderId,
  organizerId,
}: {
  orderId: string;
  organizerId: string;
}): Promise<OrganizerRefundResult> {
  const client = await pool.connect();
  let released: { eventId: string; seatIds: string[] } | undefined;
  try {
    await client.query("begin");
    const found = await client.query<{ status: string; event_id: string }>(
      `select o.status, o.event_id
       from orders o join events e on e.id = o.event_id
       where o.id = $1 and e.organizer_id = $2
       for update of o`,
      [orderId, organizerId],
    );
    const order = found.rows[0];
    if (!order) {
      await client.query("rollback");
      return { ok: false, reason: "not_found" };
    }
    if (order.status === "refunding") {
      await client.query("commit");
    } else if (order.status !== "paid") {
      await client.query("rollback");
      return { ok: false, reason: "not_refundable" };
    } else {
      const scanned = await client.query(
        `select 1 from tickets where order_id = $1 and scanned_at is not null limit 1`,
        [orderId],
      );
      if (scanned.rows.length > 0) {
        await client.query("rollback");
        return { ok: false, reason: "ticket_scanned" };
      }
      await client.query(
        `update tickets set status = 'refunded', updated_at = now() where order_id = $1 and status = 'valid'`,
        [orderId],
      );
      const seats = await client.query<{ id: string }>(
        `update seats set status = 'available', held_by = null, held_until = null, updated_at = now()
         where id in (select seat_id from tickets where order_id = $1) and status = 'sold'
         returning id`,
        [orderId],
      );
      await client.query(`update orders set status = 'refunding', updated_at = now() where id = $1`, [orderId]);
      await client.query("commit");
      released = { eventId: order.event_id, seatIds: seats.rows.map((r) => r.id) };
    }
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  if (released) await announceSeats(released.eventId, released.seatIds);
  await requestRefund(orderId, "Refunded by the organizer");
  return { ok: true };
}
