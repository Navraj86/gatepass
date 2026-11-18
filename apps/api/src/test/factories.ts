import { db, pool } from "../db/client.js";
import { events, seats, sections, type UserRole, user } from "../db/schema.js";

export async function resetDb() {
  await pool.query(
    `truncate tickets, order_items, orders, event_staff, seats, sections, events,
              session, account, verification, "user" cascade`,
  );
}

/** Inserts users by id (idempotent). Holds need no user row; orders and events do. */
export async function createUsers(ids: string[], role: UserRole = "attendee") {
  if (ids.length === 0) return;
  await db
    .insert(user)
    .values(ids.map((id) => ({ id, name: id, email: `${id}@inbox.gatepass.dev`, role })))
    .onConflictDoNothing();
}

export async function createEventWithSeats(seatCount: number, overrides: Partial<typeof events.$inferInsert> = {}) {
  const organizerId = overrides.organizerId ?? "organizer-1";
  await createUsers([organizerId], "organizer");

  const [event] = await db
    .insert(events)
    .values({
      organizerId,
      title: "Test Show",
      venue: "Test Hall",
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      saleStartsAt: new Date(Date.now() - 60 * 1000),
      status: "published",
      ...overrides,
    })
    .returning();

  const [section] = await db
    .insert(sections)
    .values({ eventId: event.id, name: "Section A", priceMinor: 150000 })
    .returning();

  const seatRows = await db
    .insert(seats)
    .values(
      Array.from({ length: seatCount }, (_, i) => ({
        eventId: event.id,
        sectionId: section.id,
        rowLabel: "A",
        seatNumber: i + 1,
      })),
    )
    .returning();

  return { event, section, seats: seatRows };
}

export async function warmPool(connections = 50) {
  await Promise.all(Array.from({ length: connections }, () => pool.query("select 1")));
}
