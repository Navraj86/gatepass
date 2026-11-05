import { pool } from "../db/client.js";
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
    console.error("Refund request failed; order stays refunding", { orderId, err });
  }
}