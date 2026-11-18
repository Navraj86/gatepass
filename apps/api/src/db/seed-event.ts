import { seatGrid } from "../events/seat-grid.js";
import { db } from "./client.js";
import { events, seats, sections } from "./schema.js";

/** 2,000 seats in three price bands, the shape the demo and the load tests use. */
export const demoLayout = [
  { name: "Front", priceMinor: 12000, rows: 8, seatsPerRow: 25 },
  { name: "Middle", priceMinor: 7000, rows: 16, seatsPerRow: 50 },
  { name: "Back", priceMinor: 4000, rows: 20, seatsPerRow: 50 },
];

/** Creates a published event that is already on sale, with seats generated from the layout. */
export async function createSeatedEvent(input: {
  organizerId: string;
  title: string;
  description: string;
  venue: string;
  layout?: typeof demoLayout;
}) {
  const layout = input.layout ?? demoLayout;
  const [event] = await db
    .insert(events)
    .values({
      organizerId: input.organizerId,
      title: input.title,
      description: input.description,
      venue: input.venue,
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      saleStartsAt: new Date(Date.now() - 60 * 1000),
      status: "published",
    })
    .returning();

  let firstRow = 0;
  for (const s of layout) {
    const [section] = await db
      .insert(sections)
      .values({ eventId: event.id, name: s.name, priceMinor: s.priceMinor })
      .returning();
    await db
      .insert(seats)
      .values(
        seatGrid(s.rows, s.seatsPerRow, firstRow).map((g) => ({ ...g, eventId: event.id, sectionId: section.id })),
      );
    firstRow += s.rows;
  }

  return { event, seatCount: layout.reduce((n, s) => n + s.rows * s.seatsPerRow, 0) };
}
