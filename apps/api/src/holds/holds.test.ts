import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/client.js";
import { seats } from "../db/schema.js";
import { createEventWithSeats, resetDb, warmPool } from "../test/factories.js";
import { holdSeats } from "./holds.js";

describe("holdSeats", () => {
    beforeEach(async () => {
        await resetDb();
    });

    it("C1: 200 buyers race for one seat, exactly one wins", async () => {
        const { event, seats: [seat] } = await createEventWithSeats(1);
        await warmPool();

        const results = await Promise.all(
            Array.from({ length: 200 }, (_, i) =>
                holdSeats({ userId: `user-${i}`, eventId: event.id, seatIds: [seat.id] }),
            ),
        );

        const winners = results.flatMap((r, i) => (r.ok ? [i] : []));
        expect(winners).toHaveLength(1);

        const losers = results.filter((r) => !r.ok);
        expect(losers).toHaveLength(199);

        const [row] = await db.select().from(seats).where(eq(seats.id, seat.id));
        expect(row.heldBy).toBe(`user-${winners[0]}`);
        expect(row.heldUntil).not.toBeNull();
    });

    it("C2: overlapping multi-seat holds are all-or-nothing, with no errors", async () => {
    const { event, seats: eventSeats } = await createEventWithSeats(4);
    await warmPool();

    const [a, b, c, d] = eventSeats.map((s) => s.id);
    const patterns = [
        [a, b], [b, a], [b, c], [c, b], [c, d], [d, c],
        [a, c], [c, a], [b, d], [d, b], [a, d], [d, a],
    ];
    const requests = Array.from({ length: 120 }, (_, i) => patterns[i % patterns.length]);

    const settled = await Promise.allSettled(
        requests.map((seatIds, i) =>
        holdSeats({ userId: `user-${i}`, eventId: event.id, seatIds }),
        ),
    );

    const failures = settled.filter((r) => r.status === "rejected");
    expect(failures).toEqual([]);

    const results = settled.map((r) => {
        if (r.status !== "fulfilled") throw r.reason;
        return r.value;
    });

    const rows = await db.select().from(seats).where(eq(seats.eventId, event.id));
    const holderOf = new Map(rows.map((r) => [r.id, r.heldBy]));

    results.forEach((result, i) => {
        for (const seatId of requests[i]) {
        if (result.ok) {
            expect(holderOf.get(seatId)).toBe(`user-${i}`);
        } else {
            expect(holderOf.get(seatId)).not.toBe(`user-${i}`);
        }
        }
    });

    const winners = results.filter((r) => r.ok).length;
    expect(winners).toBeGreaterThanOrEqual(1);
    expect(winners).toBeLessThanOrEqual(2);
    });

    it("C3: an expired hold can be taken by another buyer", async () => {
    const { event, seats: [seat] } = await createEventWithSeats(1);

    const first = await holdSeats({ userId: "user-1", eventId: event.id, seatIds: [seat.id] });
    expect(first.ok).toBe(true);

    const tooEarly = await holdSeats({ userId: "user-2", eventId: event.id, seatIds: [seat.id] });
    expect(tooEarly.ok).toBe(false);

    await db
        .update(seats)
        .set({ heldUntil: new Date(Date.now() - 1000) })
        .where(eq(seats.id, seat.id));

    const afterExpiry = await holdSeats({ userId: "user-2", eventId: event.id, seatIds: [seat.id] });
    expect(afterExpiry.ok).toBe(true);

    const [row] = await db.select().from(seats).where(eq(seats.id, seat.id));
    expect(row.heldBy).toBe("user-2");
    });

    it("refuses seats that belong to another event", async () => {
    const first = await createEventWithSeats(1);
    const second = await createEventWithSeats(1);

    const result = await holdSeats({
        userId: "user-1",
        eventId: first.event.id,
        seatIds: [second.seats[0].id],
    });

    expect(result.ok).toBe(false);
    });
});
