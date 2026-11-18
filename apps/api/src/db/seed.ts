import { eq } from "drizzle-orm";
import { auth } from "../auth/auth.js";
import { config } from "../config.js";
import { db, pool } from "./client.js";
import { eventStaff, events, type UserRole, user } from "./schema.js";
import { createSeatedEvent } from "./seed-event.js";

/**
 * Creates the demo accounts and the demo event. Safe to rerun: existing
 * accounts and the event are left alone. `--reset` wipes all data first and
 * refuses to run in production.
 */
const reset = process.argv.includes("--reset");
const password = process.env.DEMO_PASSWORD ?? (config.NODE_ENV === "production" ? undefined : "gatepass-demo");

const accounts: { email: string; name: string; role: UserRole }[] = [
  { email: "organizer@gatepass.test", name: "Demo Organizer", role: "organizer" },
  { email: "staff@gatepass.test", name: "Demo Staff", role: "staff" },
  { email: "attendee@gatepass.test", name: "Demo Attendee", role: "attendee" },
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

  const { event, seatCount } = await createSeatedEvent({
    organizerId: ids.organizer,
    title,
    description: "An evening of live indie music. 2,000 reserved seats go on sale at once.",
    venue: "Riverside Arena",
  });
  await db.insert(eventStaff).values({ eventId: event.id, userId: ids.staff });

  console.log(`Seeded "${title}" (${event.id}) with ${seatCount} seats`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
