import { defineConfig } from "vitest/config";

process.env.DATABASE_URL = "postgres://gatepass:gatepass@localhost:5432/gatepass_test";

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    setupFiles: ["./src/test/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});