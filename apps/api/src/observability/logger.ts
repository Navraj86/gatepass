import { randomUUID } from "node:crypto";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { config } from "../config.js";

export const logger = pino({
  level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
  base: { service: "api", instance: config.INSTANCE_NAME },
  redact: {
    // Never log credentials, ticket codes or customer details.
    paths: ["req.headers.cookie", "req.headers.authorization", 'req.headers["webhook-signature"]', "code", "email"],
    remove: true,
  },
  transport: config.NODE_ENV === "development" ? { target: "pino-pretty", options: { singleLine: true } } : undefined,
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customProps: (_req, res) => {
    const locals = (res as { locals?: { userId?: string } }).locals;
    return { userId: locals?.userId };
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  autoLogging: { ignore: (req) => req.url === "/metrics" || req.url?.startsWith("/api/health") === true },
});
