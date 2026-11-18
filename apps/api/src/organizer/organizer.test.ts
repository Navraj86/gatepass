import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { createUsers, resetDb } from "../test/factories.js";

const app = createApp();
const as = (id: string, role: string) => ({ "x-user-id": id, "x-user-role": role });
const organizer = as("org-1", "organizer");

const day = 24 * 60 * 60 * 1000;
const draft = {
  title: "Rooftop Sessions",
  venue: "Skyline Terrace",
  startsAt: new Date(Date.now() + 30 * day).toISOString(),
  saleStartsAt: new Date(Date.now() + 7 * day).toISOString(),
};

async function createDraft() {
  const res = await request(app).post("/api/organizer/events").set(organizer).send(draft).expect(201);
  return res.body.event.id as string;
}

describe("organizer events", () => {
  beforeEach(async () => {
    await resetDb();
    await createUsers(["org-1", "org-2"], "organizer");
    await createUsers(["staff-1"], "staff");
    await createUsers(["fan-1"]);
  });

  it("creates a draft, generates a seat grid and publishes it", async () => {
    const eventId = await createDraft();

    await request(app)
      .post(`/api/organizer/events/${eventId}/sections`)
      .set(organizer)
      .send({ name: "Floor", priceMinor: 5000, rows: 3, seatsPerRow: 10 })
      .expect(201);
    await request(app)
      .post(`/api/organizer/events/${eventId}/sections`)
      .set(organizer)
      .send({ name: "Balcony", priceMinor: 2500, rows: 2, seatsPerRow: 8 })
      .expect(201);

    const detail = await request(app).get(`/api/organizer/events/${eventId}`).set(organizer).expect(200);
    const sections = detail.body.sections as { name: string; seatCount: number; firstRow: string; lastRow: string }[];
    expect(sections.map((s) => [s.name, s.seatCount, s.firstRow, s.lastRow])).toEqual([
      ["Floor", 30, "A", "C"],
      ["Balcony", 16, "D", "E"],
    ]);

    // Drafts are not public yet.
    await request(app).get(`/api/events/${eventId}`).expect(404);

    const published = await request(app).post(`/api/organizer/events/${eventId}/publish`).set(organizer).send({});
    expect(published.status).toBe(200);
    expect(published.body.event.status).toBe("published");

    await request(app).get(`/api/events/${eventId}`).expect(200);
    await request(app)
      .patch(`/api/organizer/events/${eventId}`)
      .set(organizer)
      .send({ title: "Too late" })
      .expect(409);
  });

  it("refuses to publish an event without seats", async () => {
    const eventId = await createDraft();
    const res = await request(app).post(`/api/organizer/events/${eventId}/publish`).set(organizer).send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("no_seats");
  });

  it("checks the row, not just the role", async () => {
    const eventId = await createDraft();

    await request(app).get(`/api/organizer/events/${eventId}`).set(as("fan-1", "attendee")).expect(403);
    // Another organizer cannot even see that the event exists.
    await request(app).get(`/api/organizer/events/${eventId}`).set(as("org-2", "organizer")).expect(404);
    await request(app)
      .post(`/api/organizer/events/${eventId}/publish`)
      .set(as("org-2", "organizer"))
      .send({})
      .expect(404);
  });

  it("assigns staff accounts only", async () => {
    await pool.query(`update "user" set email = 'door@example.com' where id = 'staff-1'`);
    const eventId = await createDraft();

    await request(app)
      .post(`/api/organizer/events/${eventId}/staff`)
      .set(organizer)
      .send({ email: "fan-1@example.com" })
      .expect(422);
    await request(app)
      .post(`/api/organizer/events/${eventId}/staff`)
      .set(organizer)
      .send({ email: "DOOR@example.com" })
      .expect(201);

    const list = await request(app).get(`/api/organizer/events/${eventId}/staff`).set(organizer).expect(200);
    expect(list.body.staff).toEqual([{ id: "staff-1", name: "staff-1", email: "door@example.com" }]);
  });
});
