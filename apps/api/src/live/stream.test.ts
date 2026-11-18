import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { holdSeats } from "../holds/holds.js";
import { createEventWithSeats, resetDb } from "../test/factories.js";
import { Coalescer } from "./coalescer.js";
import { MemorySeatBus, setSeatBus } from "./seat-bus.js";
import { hub } from "./stream.js";

describe("Coalescer", () => {
  it("keeps the last state per seat and the oldest timestamp", () => {
    const c = new Coalescer();
    c.add(200, [{ seatId: "a", state: "held", heldUntil: "t1" }]);
    c.add(100, [
      { seatId: "b", state: "held", heldUntil: "t2" },
      { seatId: "a", state: "available", heldUntil: null },
    ]);

    const { changes, oldest } = c.drain();
    expect(oldest).toBe(100);
    expect(changes).toEqual([
      { seatId: "b", state: "held", heldUntil: "t2" },
      { seatId: "a", state: "available", heldUntil: null },
    ]);
    expect(c.size).toBe(0);
  });
});

type SseEvent = { event: string; data: unknown };

/** Minimal SSE reader over fetch: yields parsed `event:`/`data:` frames. */
async function openStream(url: string) {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  const queue: SseEvent[] = [];
  let buffer = "";

  async function next(timeoutMs = 2000): Promise<SseEvent> {
    const deadline = Date.now() + timeoutMs;
    while (queue.length === 0) {
      if (Date.now() > deadline) throw new Error("Timed out waiting for an SSE event");
      const { value, done } = await reader.read();
      if (done) throw new Error("Stream closed");
      buffer += value;
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (event && data) queue.push({ event, data: JSON.parse(data) });
      }
    }
    return queue.shift()!;
  }

  return { response, next, close: () => controller.abort(), reader };
}

describe("seat stream", () => {
  let server: Server;
  let base: string;
  let bus: MemorySeatBus;

  beforeEach(async () => {
    await resetDb();
    bus = new MemorySeatBus();
    setSeatBus(bus);
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    hub.closeAll();
    await new Promise((resolve) => server.close(resolve));
  });

  it("sends a snapshot, then batched changes with heldUntil", async () => {
    const { event, seats } = await createEventWithSeats(3);
    const stream = await openStream(`${base}/api/events/${event.id}/seats/stream`);
    expect(stream.response.headers.get("content-type")).toBe("text/event-stream");

    const snapshot = await stream.next();
    expect(snapshot.event).toBe("snapshot");
    expect((snapshot.data as { seats: unknown[] }).seats).toHaveLength(3);

    const hold = await holdSeats({ userId: "user-1", eventId: event.id, seatIds: [seats[0].id, seats[1].id] });
    expect(hold.ok).toBe(true);

    const batch = await stream.next();
    expect(batch.event).toBe("changes");
    const changes = batch.data as { seatId: string; state: string; heldUntil: string | null }[];
    expect(changes.map((c) => c.seatId).sort()).toEqual([seats[0].id, seats[1].id].sort());
    expect(changes.every((c) => c.state === "held" && c.heldUntil !== null)).toBe(true);
    // No user ids ever leave the server.
    expect(JSON.stringify(changes)).not.toContain("user-1");

    stream.close();
  });

  it("closes every stream when the bus resets so clients resync", async () => {
    const { event } = await createEventWithSeats(1);
    const stream = await openStream(`${base}/api/events/${event.id}/seats/stream`);
    await stream.next();
    expect(hub.connectionCount).toBe(1);

    bus.reset();

    await expect(stream.next()).rejects.toThrow("Stream closed");
    expect(hub.connectionCount).toBe(0);
  });

  it("returns 404 for an unknown event", async () => {
    const response = await fetch(`${base}/api/events/00000000-0000-4000-8000-000000000000/seats/stream`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });
});
