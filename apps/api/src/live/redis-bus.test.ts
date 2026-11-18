import { Redis } from "ioredis";
import { afterEach, describe, expect, it } from "vitest";
import { RedisSeatBus } from "./redis-bus.js";
import type { SeatMessage } from "./seat-bus.js";

// Runs against a real Redis when TEST_REDIS_URL is set (CI does); skipped otherwise.
const url = process.env.TEST_REDIS_URL;

async function until(check: () => Promise<boolean> | boolean, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe.skipIf(!url)("RedisSeatBus", () => {
  const buses: RedisSeatBus[] = [];

  function instance() {
    const bus = new RedisSeatBus(new Redis(url!), new Redis(url!));
    buses.push(bus);
    return bus;
  }

  afterEach(async () => {
    await Promise.all(buses.splice(0).map((b) => b.close()));
  });

  it("delivers a change published on one instance to subscribers on another", async () => {
    const [a, b] = [instance(), instance()];
    const eventId = crypto.randomUUID();
    const received: SeatMessage[] = [];
    b.subscribe(eventId, (m) => received.push(m));

    const probe = new Redis(url!);
    await until(async () => {
      const [, count] = (await probe.pubsub("NUMSUB", `seats:${eventId}`)) as [string, number];
      return Number(count) === 1;
    });
    await probe.quit();

    const message: SeatMessage = {
      eventId,
      at: Date.now(),
      changes: [{ seatId: crypto.randomUUID(), state: "held", heldUntil: new Date().toISOString() }],
    };
    await a.publish(message);
    await until(() => received.length === 1);
    expect(received[0]).toEqual(message);
  });

  it("asks streams to resync after the subscriber reconnects", async () => {
    const sub = new Redis(url!);
    const bus = new RedisSeatBus(new Redis(url!), sub);
    buses.push(bus);
    let resets = 0;
    bus.onReset(() => resets++);

    await until(() => bus.ready());
    sub.disconnect(true);
    await until(() => resets === 1);
  });
});
