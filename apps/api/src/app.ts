import express from "express";
import helmet from "helmet";
import { pool } from "./db/client.js";
import { errorHandler, notFound } from "./http/problem.js";
import { httpLogger } from "./observability/logger.js";
import { measureRequests, registry } from "./observability/metrics.js";
import { ordersRouter } from "./orders/routes.js";
import { webhookRouter } from "./payments/routes.js";
import { seatsRouter } from "./seats/routes.js";

export function createApp() {
  const app = express();
  // Nginx is the only hop in front of the API and it sets the real client IP.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.get("/metrics", async (_req, res) => {
    res.type(registry.contentType).send(await registry.metrics());
  });

  app.use(helmet());
  app.use(httpLogger);
  app.use(measureRequests);

  app.get("/api/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/health/ready", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok", db: "up" });
    } catch {
      res.status(503).json({ status: "error", db: "down" });
    }
  });

  app.use("/api", webhookRouter);
  app.use(express.json({ limit: "100kb" }));

  app.use("/api", seatsRouter);
  app.use("/api", ordersRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
