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
});
