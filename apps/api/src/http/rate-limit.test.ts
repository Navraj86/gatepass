import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("rate limits", () => {
  it("allows 10 hold requests per user per minute, then answers 429", async () => {
    const app = createApp();
    const user = `user-${randomUUID()}`;
    const url = `/api/events/${randomUUID()}/holds`;
    const body = { seatIds: [randomUUID()] };

    for (let i = 0; i < 10; i++) {
      const res = await request(app).post(url).set("x-user-id", user).send(body);
      expect(res.status).not.toBe(429);
    }

    const limited = await request(app).post(url).set("x-user-id", user).send(body);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("rate_limited");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);

    // Another buyer is unaffected.
    const other = await request(app).post(url).set("x-user-id", `user-${randomUUID()}`).send(body);
    expect(other.status).not.toBe(429);
  });
});
