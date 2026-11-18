import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/client.js";
import { lifecycle } from "./lifecycle.js";
import { RedisSeatBus } from "./live/redis-bus.js";
import { seatBus, setSeatBus } from "./live/seat-bus.js";
import { hub } from "./live/stream.js";
import { logger } from "./observability/logger.js";
import { createRedis, redis } from "./redis/client.js";

const subscriber = createRedis("subscriber");
if (redis && subscriber) {
  setSeatBus(new RedisSeatBus(redis, subscriber));
}

const server = createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT, redis: Boolean(redis), loadTest: config.LOAD_TEST }, "API listening");
});
// Must exceed Nginx's keepalive so a reused upstream connection is never cut mid-request.
server.keepAliveTimeout = 65_000;

/**
 * Rolling deploys send SIGTERM. Readiness goes false, open seat streams end
 * (browsers reconnect to the other instance after the retry hint), in-flight
 * requests finish, then the pools close. Compose waits 15 s; we aim for 10.
 */
async function shutdown(signal: string) {
  if (lifecycle.draining) return;
  lifecycle.draining = true;
  logger.info({ signal, streams: hub.connectionCount }, "Shutting down");

  const force = setTimeout(() => {
    logger.warn("Shutdown timed out; exiting");
    process.exit(1);
  }, 10_000);
  force.unref();

  hub.closeAll();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });
  await Promise.allSettled([pool.end(), seatBus().close(), redis?.quit()]);
  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
