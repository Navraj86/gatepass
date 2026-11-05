import express, { type NextFunction, type Request, type Response } from "express";
import { pool } from "./db/client.js";
import { seatsRouter } from "./seats/routes.js";
import { webhookRouter } from "./payments/routes.js";
import { ordersRouter } from "./orders/routes.js";

export function createApp() {
    const app = express();
    app.use("/api", webhookRouter);
    app.use(express.json());

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });

    app.get("/health/ready", async (_req, res) => {
        try {
            await pool.query("select 1");
            res.json({ status: "ok", db: "up" });
        } catch {
            res.status(503).json({ status: "error", db: "down" });
        }
    });

    app.use("/api", seatsRouter);
    app.use("/api", ordersRouter);

    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        console.error(err);
        res.status(500).json({ code: "internal_error", message: "Something went wrong" });
    });

    return app;
};
