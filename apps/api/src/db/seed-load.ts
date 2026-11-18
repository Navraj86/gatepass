import { randomBytes, randomUUID } from "node:crypto";
import { config } from "../config.js";
import { pool } from "./client.js";
import { createSeatedEvent } from "./seed-event.js";

/**
 * Prepares one load-test run: a fresh on-sale event with 2,000 seats and N buyers,
 * each with a session token k6 sends as `Authorization: Bearer`. Users and sessions
 * go straight into the database so the sign-up rate limit does not apply.
 *
 *   node dist/db/seed-load.js --users 5000 > load/run.json
 *
 * Only runs with LOAD_TEST=true, the same flag that enables bearer tokens and the
 * payment stub. Progress goes to stderr; the JSON on stdout is the run file.
 */
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};

async function main() {
  if (!config.LOAD_TEST) throw new Error("Refusing to run without LOAD_TEST=true");
  const count = arg("users", 5000);
  if (!Number.isInteger(count) || count < 1 || count > 50_000) throw new Error("--users must be 1 to 50000");

  const organizer = await pool.query<{ id: string }>(
    `select id from "user" where role = 'organizer' order by created_at limit 1`,
  );
  if (!organizer.rows[0]) throw new Error("No organizer account; run the demo seed first");

  const run = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const { event, seatCount } = await createSeatedEvent({
    organizerId: organizer.rows[0].id,
    title: `Load test ${run}`,
    description: "Created by seed-load for a k6 run.",
    venue: "k6",
  });

  const users = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    sessionId: randomUUID(),
    token: randomBytes(24).toString("base64url"),
    email: `load-${run}-${i}@load.gatepass.test`,
  }));

  // Batches keep each statement's parameter arrays at a sensible size.
  for (let i = 0; i < users.length; i += 1000) {
    const batch = users.slice(i, i + 1000);
    await pool.query(
      `insert into "user" (id, name, email, email_verified, role)
       select unnest($1::text[]), 'Load Buyer', unnest($2::text[]), true, 'attendee'`,
      [batch.map((u) => u.id), batch.map((u) => u.email)],
    );
    await pool.query(
      `insert into session (id, token, user_id, expires_at)
       select unnest($1::text[]), unnest($2::text[]), unnest($3::text[]), now() + interval '1 day'`,
      [batch.map((u) => u.sessionId), batch.map((u) => u.token), batch.map((u) => u.id)],
    );
    console.error(`users ${Math.min(i + 1000, count)}/${count}`);
  }

  console.error(`Event ${event.id} with ${seatCount} seats, ${count} buyers`);
  process.stdout.write(
    `${JSON.stringify({ eventId: event.id, seats: seatCount, users: users.map((u) => ({ token: u.token, email: u.email })) })}\n`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
