import type { NextFunction, Request, Response } from "express";
import { type RateLimiterAbstract, RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { logger } from "../observability/logger.js";
import { redis } from "../redis/client.js";
import { sendProblem } from "./problem.js";

type KeyFn = (req: Request, res: Response) => string | undefined;

/**
 * Fixed-window limits shared by every API instance through Redis. If Redis
 * is unreachable the request is let through: a limit is protection, not
 * correctness, and PostgreSQL still guards every seat.
 */
export function rateLimit(name: string, points: number, durationSeconds: number, keyOf: KeyFn) {
  const options = { keyPrefix: `rl:${name}`, points, duration: durationSeconds };
  const limiter: RateLimiterAbstract = redis
    ? new RateLimiterRedis({ ...options, storeClient: redis, useRedisPackage: false })
    : new RateLimiterMemory(options);

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyOf(req, res);
    if (!key) {
      next();
      return;
    }
    try {
      await limiter.consume(key);
      next();
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfter = Math.max(1, Math.ceil(err.msBeforeNext / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        sendProblem(res, 429, "rate_limited", "Too many requests. Try again shortly", { retryAfter });
        return;
      }
      logger.warn({ err, name }, "Rate limiter unavailable; allowing request");
      next();
    }
  };
}

export const byUser: KeyFn = (_req, res) => res.locals.userId;
export const byIp: KeyFn = (req) => req.ip;
