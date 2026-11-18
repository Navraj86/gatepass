import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./observability/logger.js";

createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "API listening");
});
