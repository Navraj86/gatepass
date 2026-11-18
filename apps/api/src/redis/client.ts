import { Redis } from "ioredis";
import { config } from "../config.js";
import { logger } from "../observability/logger.js";

/**
 * Redis is optional outside production: without REDIS_URL the API runs as a
 * single instance with an in-memory seat bus and in-memory rate limits.
 * Nothing in Redis must survive a restart.
 */
export function createRedis(name: string): Redis | undefined {
  if (!config.REDIS_URL) return undefined;
  const client = new Redis(config.REDIS_URL, {
    connectionName: `${config.INSTANCE_NAME}-${name}`,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });
  client.on("error", (err) => logger.warn({ err: err.message, name }, "Redis error"));
  return client;
}

export const redis = createRedis("commands");
