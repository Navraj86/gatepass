import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL;
if(!url) {
    throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
export const db = drizzle(pool, { schema });
