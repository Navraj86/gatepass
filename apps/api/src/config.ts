import "dotenv/config";
import { z } from "zod";

const flag = z
  .enum(["true", "false", ""])
  .optional()
  .transform((v) => v === "true");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    INSTANCE_NAME: z.string().default("api"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    APP_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    REDIS_URL: z.string().optional(),
    DEV_AUTH: flag,
    LOAD_TEST: flag,
    DODO_PAYMENTS_API_KEY: z.string().optional(),
    DODO_PRODUCT_ID: z.string().optional(),
    DODO_PAYMENTS_WEBHOOK_KEY: z.string().min(1),
    DODO_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Gatepass <tickets@gatepass.navraj.dev>"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.DEV_AUTH) {
      ctx.addIssue({ code: "custom", path: ["DEV_AUTH"], message: "must be off in production" });
    }
    if (!env.REDIS_URL) {
      ctx.addIssue({ code: "custom", path: ["REDIS_URL"], message: "is required in production" });
    }
    if (!env.LOAD_TEST && (!env.DODO_PAYMENTS_API_KEY || !env.DODO_PRODUCT_ID)) {
      ctx.addIssue({
        code: "custom",
        path: ["DODO_PAYMENTS_API_KEY"],
        message: "Dodo API key and product id are required in production",
      });
    }
  });

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    console.error(`Invalid configuration:\n${problems}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = load();
export type Config = typeof config;
