import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Webhook } from "standardwebhooks";
import { webhookEvent } from "../payments/webhook.js";

const raw = JSON.parse(
  readFileSync(new URL("./fixtures/dodo-payment-succeeded.json", import.meta.url), "utf8"),
);
const fixture = raw.event ?? raw;

export function paymentSucceededJson(paymentId: string, orderId: string, amountMinor: number) {
  const tax = Math.round(amountMinor * 0.18);
  return {
    ...fixture,
    type: "payment.succeeded",
    data: {
      ...fixture.data,
      payment_id: paymentId,
      metadata: { order_id: orderId },
      settlement_amount: amountMinor + tax,
      settlement_tax: tax,
      settlement_currency: "USD",
    },
  };
}

export function paymentSucceeded(paymentId: string, orderId: string, amountMinor: number) {
  return webhookEvent.parse(paymentSucceededJson(paymentId, orderId, amountMinor));
}

export function paymentFailed(paymentId: string, errorCode: string) {
  return webhookEvent.parse({ type: "payment.failed", data: { payment_id: paymentId, error_code: errorCode } });
}

export function signedHeaders(body: string) {
  const webhook = new Webhook(process.env.DODO_PAYMENTS_WEBHOOK_KEY!);
  const id = `msg_test_${randomUUID()}`;
  const timestamp = new Date();
  return {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": webhook.sign(id, timestamp, body),
  };
}