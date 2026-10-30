import { afterAll } from "vitest";
import { pool } from "../db/client.js";

afterAll(async () => {
    await pool.end();
});
