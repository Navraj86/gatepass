// Shared helpers for the k6 scenarios. Run files come from `seed-load` (see README.md).
import crypto from "k6/crypto";
import { SharedArray } from "k6/data";
import { b64decode } from "k6/encoding";

export const BASE_URL = (__ENV.BASE_URL || "http://localhost:4000").replace(/\/$/, "");

const runFile = __ENV.RUN_FILE || "./run.json";
const run = JSON.parse(open(runFile));
export const EVENT_ID = run.eventId;
export const users = new SharedArray("users", () => run.users);

export function authHeaders(user) {
  // No Origin header: the API's same-origin check only applies to requests that send one.
  return { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" };
}

/** Standard Webhooks signature, the same scheme Dodo uses, so the real handler verifies it. */
export function signedWebhook(body) {
  const secret = __ENV.DODO_PAYMENTS_WEBHOOK_KEY;
  if (!secret) throw new Error("Set DODO_PAYMENTS_WEBHOOK_KEY to the server's webhook key");
  const key = b64decode(secret.replace(/^whsec_/, ""), "std");
  const id = `msg_load_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.hmac("sha256", key, `${id}.${timestamp}.${body}`, "base64");
  return {
    "Content-Type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
}

/** The payment.succeeded event Dodo would send for an order paid in full with no tax. */
export function paymentSucceeded(order) {
  return JSON.stringify({
    business_id: "load",
    type: "payment.succeeded",
    timestamp: new Date().toISOString(),
    data: {
      payload_type: "Payment",
      payment_id: `pay_load_${order.id}`,
      metadata: { order_id: order.id },
      total_amount: order.amountMinor,
      tax: 0,
      currency: order.currency,
      settlement_amount: order.amountMinor,
      settlement_tax: 0,
      settlement_currency: order.currency,
    },
  });
}

export function pick(list, n) {
  const chosen = new Set();
  while (chosen.size < Math.min(n, list.length)) chosen.add(list[Math.floor(Math.random() * list.length)]);
  return [...chosen];
}
