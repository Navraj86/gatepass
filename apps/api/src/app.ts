import { toNodeHandler } from "better-auth/node";
import express from "express";
import helmet from "helmet";
import { auth } from "./auth/auth.js";
import { currentUser, requireUser } from "./auth/middleware.js";
import { pool } from "./db/client.js";
import { sameOrigin } from "./http/origin.js";
import { errorHandler, notFound } from "./http/problem.js";
import { byIp, rateLimit } from "./http/rate-limit.js";
import { seatBus } from "./live/seat-bus.js";
import { httpLogger } from "./observability/logger.js";
import { measureRequests, registry } from "./observability/metrics.js";
import { meRouter } from "./orders/me-routes.js";
import { ordersRouter } from "./orders/routes.js";
import { organizerRouter } from "./organizer/routes.js";
import { webhookRouter } from "./payments/routes.js";
import { seatsRouter } from "./seats/routes.js";
import { staffRouter } from "./staff/routes.js";

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
    const db = await pool.query("select 1").then(
      () => "up",
      () => "down",
    );
    const bus = (await seatBus().ready()) ? "up" : "down";
    const ok = db === "up" && bus === "up";
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "error", db, bus });
  });

  // Raw-body routes go before express.json(): webhook signatures and Better
  // Auth both read the request stream themselves.
  app.use("/api", webhookRouter);
  app.post("/api/auth/sign-in/email", rateLimit("sign-in", 10, 60, byIp));
  app.post("/api/auth/sign-up/email", rateLimit("sign-up", 5, 60, byIp));
  app.all("/api/auth/{*path}", toNodeHandler(auth));

  app.use(express.json({ limit: "100kb" }));
  app.use("/api", sameOrigin);

  app.get("/api/me", requireUser, (_req, res) => {
    res.json({ user: currentUser(res) });
  });

  app.use("/api", seatsRouter);
  app.use("/api", ordersRouter);
  app.use("/api", organizerRouter);
  app.use("/api", staffRouter);
  app.use("/api", meRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
