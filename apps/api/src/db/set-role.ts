import { eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import { type UserRole, user, userRoles } from "./schema.js";

// Usage: pnpm user:role <email> <attendee|organizer|staff>
const [email, role] = process.argv.slice(2);

async function main() {
  if (!email || !userRoles.includes(role as UserRole)) {
    throw new Error(`Usage: set-role <email> <${userRoles.join("|")}>`);
  }
  const updated = await db
    .update(user)
    .set({ role: role as UserRole })
    .where(eq(user.email, email.toLowerCase()))
    .returning({ id: user.id });
  if (updated.length === 0) throw new Error(`No user with email ${email}`);
  console.log(`${email} is now ${role}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
