import { db, pool } from "./client.js";
import { events, sections, seats } from "./schema.js";

async function main() {
  await pool.query("truncate seats, sections, events cascade");

  const [event] = await db
    .insert(events)
    .values({
      organizerId: "organizer-1",
      title: "Punjab Indie Night",
      venue: "City Auditorium, Chandigarh",
      startsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      saleStartsAt: new Date(Date.now() - 60 * 1000),
      status: "published",
    })
    .returning();

  const layout = [
    { name: "Section A", priceMinor: 150000, rows: ["A", "B", "C", "D"], perRow: 10 },
    { name: "Section B", priceMinor: 80000, rows: ["E", "F", "G", "H", "I", "J"], perRow: 10 },
  ];

  for (const s of layout) {
    const [section] = await db
      .insert(sections)
      .values({ eventId: event.id, name: s.name, priceMinor: s.priceMinor })
      .returning();

    await db.insert(seats).values(
      s.rows.flatMap((row) =>
        Array.from({ length: s.perRow }, (_, i) => ({
          eventId: event.id,
          sectionId: section.id,
          rowLabel: row,
          seatNumber: i + 1,
        })),
      ),
    );
  }

  console.log(`Seeded event: ${event.id}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
