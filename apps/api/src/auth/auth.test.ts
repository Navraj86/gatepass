import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetDb } from "../test/factories.js";

const origin = "http://localhost:3000";

describe("auth", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("signs up as an attendee and reads the session from the cookie", async () => {
    const app = createApp();
    const agent = request.agent(app);

    const signUp = await agent
      .post("/api/auth/sign-up/email")
      .set("origin", origin)
      .send({ email: "ana@example.com", password: "correct-horse-1", name: "Ana", role: "organizer" });
    expect(signUp.status).toBe(200);
    expect(String(signUp.headers["set-cookie"])).toMatch(/HttpOnly/i);

    const me = await agent.get("/api/me");
    expect(me.status).toBe(200);
    // role is not an input: a signup can never choose to be an organizer.
    expect(me.body.user).toMatchObject({ email: "ana@example.com", role: "attendee" });
  });

  it("rejects a wrong password and requests without a session", async () => {
    const app = createApp();
    await request(app)
      .post("/api/auth/sign-up/email")
      .set("origin", origin)
      .send({ email: "bo@example.com", password: "correct-horse-1", name: "Bo" })
      .expect(200);

    await request(app)
      .post("/api/auth/sign-in/email")
      .set("origin", origin)
      .send({ email: "bo@example.com", password: "wrong-password" })
      .expect(401);

    const me = await request(app).get("/api/me");
    expect(me.status).toBe(401);
    expect(me.body.code).toBe("unauthorized");
  });

  it("signs in the mobile app with a bearer token instead of a cookie", async () => {
    const app = createApp();
    await request(app)
      .post("/api/auth/sign-up/email")
      .set("origin", origin)
      .send({ email: "cy@example.com", password: "correct-horse-1", name: "Cy" })
      .expect(200);

    // The app sends no Origin and no cookies, like React Native's fetch with credentials omitted.
    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "cy@example.com", password: "correct-horse-1" })
      .expect(200);
    const token = String(signIn.headers["set-auth-token"]);
    expect(token).toContain(".");

    const me = await request(app).get("/api/me").set("authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: "cy@example.com" });

    // A changed signature and the bare token without its signature are both refused.
    const [raw] = token.split(".");
    for (const bad of [`${raw}.forged`, raw]) {
      const res = await request(app).get("/api/me").set("authorization", `Bearer ${bad}`);
      expect(res.status).toBe(401);
    }
  });

  it("refuses state-changing requests from another origin", async () => {
    const res = await request(createApp())
      .delete("/api/events/00000000-0000-4000-8000-000000000000/holds")
      .set("origin", "https://evil.example")
      .set("x-user-id", "user-1");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("bad_origin");
  });
});
