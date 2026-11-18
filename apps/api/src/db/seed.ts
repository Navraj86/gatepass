import { eq } from "drizzle-orm";
import { auth } from "../auth/auth.js";
import { config } from "../config.js";
import { seatGrid } from "../events/seat-grid.js";
import { db, pool } from "./client.js";
import { eventStaff, events, seats, sections, user, type UserRole } from "./schema.js";

/**
 * Creates the demo accounts and the demo event. Safe to rerun: existing
 * accounts and the event are left alone. `--reset` wipes all data first and
 * refuses to run in production.
 */
const reset = process.argv.includes("--reset");
const password = process.env.DEMO_PASSWORD ?? (config.NODE_ENV === "production" ? undefined : "gatepass-demo");

const accounts: { email: string; name: string; role: UserRole }[] = [
  { email: "organizer@demo.gatepass.app", name: "Demo Organizer", role: "organizer" },
  { email: "staff@demo.gatepass.app", name: "Demo Staff", role: "staff" },
  { email: "attendee@demo.gatepass.app", name: "Demo Attendee", role: "attendee" },
];

const layout = [
  { name: "Front", priceMinor: 12000, rows: 8, seatsPerRow: 25 },
  { name: "Middle", priceMinor: 7000, rows: 16, seatsPerRow: 50 },
  { name: "Back", priceMinor: 4000, rows: 20, seatsPerRow: 50 },
];

async function ensureAccount(email: string, name: string, role: UserRole) {
  let [row] = await db.select().from(user).where(eq(user.email, email));
  if (!row) {
    await auth.api.signUpEmail({ body: { email, password: password!, name } });
    [row] = await db.select().from(user).where(eq(user.email, email));
  }
  if (row.role !== role) {
    await db.update(user).set({ role }).where(eq(user.id, row.id));
  }
  return row.id;
}

async function main() {
  if (!password) {
    throw new Error("Set DEMO_PASSWORD to seed demo accounts in production");
  }
  if (reset) {
    if (config.NODE_ENV === "production") throw new Error("--reset is not allowed in production");
    await pool.query(
      `truncate tickets, order_items, orders, event_staff, seats, sections, events,
                session, account, verification, "user" cascade`,
    );
  }

  const ids: Record<UserRole, string> = { attendee: "", organizer: "", staff: "" };
  for (const a of accounts) {
    ids[a.role] = await ensureAccount(a.email, a.name, a.role);
  }

  const title = "Gatepass Launch Night";
  const [existing] = await db.select().from(events).where(eq(events.title, title));
  if (existing) {
    console.log(`Demo data already present (event ${existing.id})`);
    return;
  }

  const [event] = await db
    .insert(events)
    .values({
      organizerId: ids.organizer,
      title,
      description: "An evening of live indie music. 2,000 reserved seats go on sale at once.",
      venue: "Riverside Arena",
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
      .values(seatGrid(s.rows, s.seatsPerRow, firstRow).map((g) => ({ ...g, eventId: event.id, sectionId: section.id })));
    firstRow += s.rows;
  }
  await db.insert(eventStaff).values({ eventId: event.id, userId: ids.staff });

  const total = layout.reduce((n, s) => n + s.rows * s.seatsPerRow, 0);
  console.log(`Seeded "${title}" (${event.id}) with ${total} seats`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
