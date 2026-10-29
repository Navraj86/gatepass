import express from "express";
import { pool } from "./db/client.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.get("/health/ready", async (_req, res) => {
    try {
        await pool.query("select 1");
        res.json({ status: "ok", db: "up" });
    } catch (error) {
        res.status(503).json({ status: "error", db: "down" });
    }
});

app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
});
