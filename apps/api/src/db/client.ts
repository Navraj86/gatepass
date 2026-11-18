import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

// A request that cannot get a connection within 5 s fails with a 500 instead of queueing forever.
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  connectionTimeoutMillis: 5000,
});
export const db = drizzle(pool, { schema });
