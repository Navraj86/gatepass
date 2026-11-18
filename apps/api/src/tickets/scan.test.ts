import { CODE_LENGTH, encodeTicketCode, formatTicketCode, normalizeTicketCode } from "@gatepass/shared";
import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { db } from "../db/client.js";
import { eventStaff, tickets } from "../db/schema.js";
import { holdSeats } from "../holds/holds.js";
import { startCheckout } from "../orders/checkout.js";
import { setPaymentGateway } from "../payments/gateway.js";
import { processWebhook } from "../payments/webhook.js";
import { createEventWithSeats, createUsers, resetDb, warmPool } from "../test/factories.js";
import { createFakeGateway } from "../test/fake-gateway.js";
import { paymentSucceeded } from "../test/webhooks.js";
import { newTicketCode } from "./code.js";
import { scanTicket } from "./scan.js";

async function buyTicket(eventId: string, seatId: string, userId = "fan-1") {
  await holdSeats({ userId, eventId, seatIds: [seatId] });
  const checkout = await startCheckout({
    userId,
    eventId,
    customer: { email: "fan@example.com", name: "Fan" },
    billing: { country: "IN", zipcode: "151001" },
  });
  if (!checkout.ok) throw new Error(checkout.reason);
  const [order] = await db.query.orders.findMany({ where: (o, { eq }) => eq(o.id, checkout.orderId) });
  await processWebhook(paymentSucceeded(order.dodoPaymentId!, order.id, order.amountMinor));
  const [ticket] = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
  return ticket;
}

describe("ticket codes", () => {
  it("are 26 base32 characters and survive what people type", () => {
    const code = newTicketCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(code).toHaveLength(CODE_LENGTH);
    expect(normalizeTicketCode(formatTicketCode(code).toLowerCase())).toBe(code);
    expect(encodeTicketCode(new Uint8Array(16))).toBe("0".repeat(26));
  });
});

describe("check-in", () => {
  beforeEach(async () => {
    await resetDb();
    await createUsers(["fan-1", "fan-2"]);
    await createUsers(["door-1", "door-2"], "staff");
    setPaymentGateway(createFakeGateway().gateway);
  });

  it("C6: fifty parallel scans of one ticket give exactly one green", async () => {
    const { event, seats } = await createEventWithSeats(1);
    const ticket = await buyTicket(event.id, seats[0].id);
    await warmPool();

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        scanTicket({ eventId: event.id, rawCode: ticket.code, staffId: i % 2 ? "door-1" : "door-2" }),
      ),
    );

    expect(results.filter((r) => r.result === "valid")).toHaveLength(1);
    expect(results.filter((r) => r.result === "duplicate")).toHaveLength(49);
    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row.scannedAt).not.toBeNull();
  });

  it("explains every red result", async () => {
    const { event, seats } = await createEventWithSeats(2);
    const other = await createEventWithSeats(1);
    const ticket = await buyTicket(event.id, seats[0].id);

    expect(await scanTicket({ eventId: event.id, rawCode: "not-a-code", staffId: "door-1" })).toEqual({
      result: "invalid",
    });
    expect(await scanTicket({ eventId: event.id, rawCode: newTicketCode(), staffId: "door-1" })).toEqual({
      result: "invalid",
    });
    expect(await scanTicket({ eventId: other.event.id, rawCode: ticket.code, staffId: "door-1" })).toMatchObject({
      result: "wrong_event",
    });

    const first = await scanTicket({ eventId: event.id, rawCode: ticket.code.toLowerCase(), staffId: "door-1" });
    expect(first).toMatchObject({ result: "valid", seat: { rowLabel: "A", seatNumber: 1 }, holderName: "fan-1" });

    const again = await scanTicket({ eventId: event.id, rawCode: ticket.code, staffId: "door-2" });
    expect(again).toMatchObject({ result: "duplicate", scannedByName: "door-1" });

    const refunded = await buyTicket(event.id, seats[1].id, "fan-2");
    await db.update(tickets).set({ status: "refunded" }).where(eq(tickets.id, refunded.id));
    expect(await scanTicket({ eventId: event.id, rawCode: refunded.code, staffId: "door-1" })).toMatchObject({
      result: "refunded",
    });
  });

  it("only lets assigned staff or the organizer scan an event", async () => {
    const app = createApp();
    const { event, seats } = await createEventWithSeats(1);
    const ticket = await buyTicket(event.id, seats[0].id);
    const body = { eventId: event.id, code: ticket.code };

    await request(app)
      .post("/api/staff/scan")
      .set({ "x-user-id": "door-1", "x-user-role": "staff" })
      .send(body)
      .expect(403);
    await request(app)
      .post("/api/staff/scan")
      .set({ "x-user-id": "fan-1", "x-user-role": "attendee" })
      .send(body)
      .expect(403);

    await db.insert(eventStaff).values({ eventId: event.id, userId: "door-1" });
    const ok = await request(app)
      .post("/api/staff/scan")
      .set({ "x-user-id": "door-1", "x-user-role": "staff" })
      .send(body)
      .expect(200);
    expect(ok.body.result).toBe("valid");

    // The event's own organizer may scan too.
    const organizer = await request(app)
      .post("/api/staff/scan")
      .set({ "x-user-id": "organizer-1", "x-user-role": "organizer" })
      .send(body)
      .expect(200);
    expect(organizer.body.result).toBe("duplicate");
  });
});
