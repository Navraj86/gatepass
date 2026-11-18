import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("API docs", () => {
  it("serves an OpenAPI document built from the Zod schemas", async () => {
    const res = await request(createApp()).get("/api/openapi.json").expect(200);
    expect(res.body.openapi).toBe("3.1.0");
    const hold = res.body.paths["/api/events/{eventId}/holds"].post;
    expect(hold.requestBody.content["application/json"].schema.properties.seatIds.maxItems).toBe(6);
  });

  it("answers unknown routes with problem+json", async () => {
    const res = await request(createApp()).get("/api/nope").expect(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({ status: 404, code: "not_found" });
  });
});
