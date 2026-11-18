import { createApp } from "./app.js";
import { config } from "./config.js";
import { RedisSeatBus } from "./live/redis-bus.js";
import { setSeatBus } from "./live/seat-bus.js";
import { logger } from "./observability/logger.js";
import { createRedis, redis } from "./redis/client.js";

const subscriber = createRedis("subscriber");
if (redis && subscriber) {
  setSeatBus(new RedisSeatBus(redis, subscriber));
}

createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT, redis: Boolean(redis) }, "API listening");
});
