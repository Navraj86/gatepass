import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { account, session, user, verification } from "../db/schema.js";

/**
 * Better Auth runs inside the API with sessions in PostgreSQL: a session row,
 * an httpOnly cookie and a middleware. Revoking a session is deleting a row.
 */
export const auth = betterAuth({
  appName: "Gatepass",
  baseURL: config.APP_URL,
  basePath: "/api/auth",
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.APP_URL],
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      // Every signup is an attendee; organizer and staff roles are granted by an admin script.
      role: { type: "string", required: false, defaultValue: "attendee", input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    useSecureCookies: config.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] },
  },
  // Sign-in and sign-up are limited in Express with the shared Redis limiter.
  rateLimit: { enabled: false },
  telemetry: { enabled: false },
  // Load tests authenticate thousands of virtual users with seeded session tokens.
  plugins: config.LOAD_TEST ? [bearer()] : [],
});
