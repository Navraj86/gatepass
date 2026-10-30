import { db, pool } from "../db/client.js";
import { events, seats, sections } from "../db/schema.js";

export async function resetDb() {
    await pool.query("truncate seats, sections, events cascade");
}

export async function createEventWithSeats(seatCount: number) {
    const [event] = await db.insert(events).values({
        organizerId: "organizer-1",
        title: "Test Show",
        venue: "Test Hall",
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        saleStartsAt: new Date(Date.now() - 60 * 1000),
        status: "published",
    }).returning();

    const [section] = await db.insert(sections).values({
        eventId: event.id,
        name: "Section A",
        priceMinor: 150000
    }).returning();

    const seatRows = await db.insert(seats).values(
        Array.from({ length: seatCount }, (_, i) => ({
            eventId: event.id,
            sectionId: section.id,
            rowLabel: "A",
            seatNumber: i + 1,
        })),
    ).returning();

    return { event, section, seats: seatRows };
};

export async function warmPool(connections = 50) {
  await Promise.all(Array.from({ length: connections }, () => pool.query("select 1")));
}
