import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { db } from "../db/client.js";
import { orderItems, orders, seats, tickets } from "../db/schema.js";
import { holdSeats } from "../holds/holds.js";
import { setPaymentGateway } from "../payments/gateway.js";
import { processWebhook } from "../payments/webhook.js";
import { createFakeGateway } from "../test/fake-gateway.js";
import { createEventWithSeats, resetDb, warmPool } from "../test/factories.js";
import { paymentFailed, paymentSucceeded, paymentSucceededJson, signedHeaders } from "../test/webhooks.js";
import { cancelCheckout, startCheckout } from "./checkout.js";

const customer = { email: "buyer@example.com", name: "Test Buyer" };
const billing = { country: "IN", zipcode: "151001" };

let fake: ReturnType<typeof createFakeGateway>;

beforeEach(async () => {
  await resetDb();
  fake = createFakeGateway();
  setPaymentGateway(fake.gateway);
});

async function holdAndCheckout(userId: string, eventId: string, seatIds: string[]) {
  const hold = await holdSeats({ userId, eventId, seatIds });
  expect(hold.ok).toBe(true);
  const result = await startCheckout({ userId, eventId, customer, billing });
  if (!result.ok) {
    throw new Error(`Checkout failed: ${result.reason}`);
  }
  const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId));
  return order;
}

describe("checkout", () => {
  it("creates a pending order with items and extends the holds", async () => {
    const { event, seats: [s1, s2] } = await createEventWithSeats(2);
    const order = await holdAndCheckout("user-1", event.id, [s1.id, s2.id]);

    expect(order.status).toBe("pending");
    expect(order.amountMinor).toBe(300000);
    expect(order.dodoPaymentId).toBe("pay_test_1");
    expect(fake.sessions).toHaveLength(1);

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(items).toHaveLength(2);

    const rows = await db.select().from(seats).where(eq(seats.eventId, event.id));
    for (const seat of rows) {
      expect(seat.heldUntil!.getTime()).toBeGreaterThan(order.expiresAt.getTime());
    }
  });

  it("refuses checkout without active holds", async () => {
    const { event } = await createEventWithSeats(1);
    const result = await startCheckout({ userId: "user-1", eventId: event.id, customer, billing });
    expect(result).toEqual({ ok: false, reason: "no_holds" });
  });

  it("marks the order failed when the payment provider is down", async () => {
    const { event, seats: [seat] } = await createEventWithSeats(1);
    await holdSeats({ userId: "user-1", eventId: event.id, seatIds: [seat.id] });
    fake.setFailing(true);

    const result = await startCheckout({ userId: "user-1", eventId: event.id, customer, billing });

    expect(result).toEqual({ ok: false, reason: "payment_unavailable" });
    const [order] = await db.select().from(orders);
    expect(order.status).toBe("failed");
  });

  it("C7: ten parallel checkouts create one order and one session", async () => {
    const { event, seats: [seat] } = await createEventWithSeats(1);
    await holdSeats({ userId: "user-1", eventId: event.id, seatIds: [seat.id] });
    await warmPool();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => startCheckout({ userId: "user-1", eventId: event.id, customer, billing })),
    );

    expect(fake.sessions).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason !== "in_progress")).toHaveLength(0);
    const pending = await db.select().from(orders).where(eq(orders.status, "pending"));
    expect(pending).toHaveLength(1);
  });
});

describe("payment webhooks", () => {
  it("C4: duplicate payment.succeeded deliveries fulfil the order once", async () => {
    const { event, seats: [s1, s2] } = await createEventWithSeats(2);
    const order = await holdAndCheckout("user-1", event.id, [s1.id, s2.id]);
    const webhook = paymentSucceeded(order.dodoPaymentId!, order.id, order.amountMinor);
    await warmPool();

    const outcomes = await Promise.all(Array.from({ length: 10 }, () => processWebhook(webhook)));

    expect(outcomes.filter((o) => o === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "duplicate")).toHaveLength(9);

    const [paid] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(paid.status).toBe("paid");
    expect(paid.chargedCurrency).toBe("INR");

    const issued = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
    expect(issued).toHaveLength(2);

    const sold = await db.select().from(seats).where(eq(seats.eventId, event.id));
    expect(sold.every((s) => s.status === "sold")).toBe(true);
  });

  it("C5: a payment for a seat that was resold is refunded, never ticketed", async () => {
    const { event, seats: [seat] } = await createEventWithSeats(1);
    const order = await holdAndCheckout("user-1", event.id, [seat.id]);

    await db.update(seats).set({ heldUntil: new Date(Date.now() - 1000) }).where(eq(seats.id, seat.id));
    const retaken = await holdSeats({ userId: "user-2", eventId: event.id, seatIds: [seat.id] });
    expect(retaken.ok).toBe(true);

    const outcome = await processWebhook(paymentSucceeded(order.dodoPaymentId!, order.id, order.amountMinor));

    expect(outcome).toBe("refunding");
    const [refunding] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(refunding.status).toBe("refunding");
    expect(refunding.dodoRefundId).toBe("ref_test_1");
    expect(fake.refunds).toHaveLength(1);
    expect(await db.select().from(tickets)).toHaveLength(0);

    const [row] = await db.select().from(seats).where(eq(seats.id, seat.id));
    expect(row.heldBy).toBe("user-2");
  });

  it("C9: cancel racing a payment never leaves tickets on released seats", async () => {
    const { event, seats: [seat] } = await createEventWithSeats(1);
    const order = await holdAndCheckout("user-1", event.id, [seat.id]);
    await warmPool();

    await Promise.all([
      cancelCheckout({ userId: "user-1", orderId: order.id }),
      processWebhook(paymentSucceeded(order.dodoPaymentId!, order.id, order.amountMinor)),
    ]);

    const [final] = await db.select().from(orders).where(eq(orders.id, order.id));
    const issued = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
    if (issued.length > 0) {
      expect(final.status).toBe("paid");
      expect(issued).toHaveLength(1);
    } else {
      expect(final.status).toBe("refunding");
    }
  });

  it("payment.failed records the reason and keeps the holds", async () => {
    const { event, seats: [seat] } = await createEventWithSeats(1);
    const order = await holdAndCheckout("user-1", event.id, [seat.id]);

    const outcome = await processWebhook(paymentFailed(order.dodoPaymentId!, "PAYMENT_METHOD_UNSUPPORTED"));

    expect(outcome).toBe("failed");
    const [failed] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("PAYMENT_METHOD_UNSUPPORTED");

    const [row] = await db.select().from(seats).where(eq(seats.id, seat.id));
    expect(row.heldBy).toBe("user-1");
  });

  it("rejects unsigned webhooks and accepts signed ones over HTTP", async () => {
    const app = createApp();
    const { event, seats: [seat] } = await createEventWithSeats(1);
    const order = await holdAndCheckout("user-1", event.id, [seat.id]);
    const body = JSON.stringify(paymentSucceededJson(order.dodoPaymentId!, order.id, order.amountMinor));

    await request(app)
      .post("/api/webhooks/dodo")
      .set({ "content-type": "application/json", "webhook-id": "x", "webhook-timestamp": "1", "webhook-signature": "v1,bad" })
      .send(body)
      .expect(401);

    await request(app).post("/api/webhooks/dodo").set(signedHeaders(body)).send(body).expect(200);

    const [paid] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(paid.status).toBe("paid");
  });
});