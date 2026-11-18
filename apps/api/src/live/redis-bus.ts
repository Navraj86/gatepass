import type { Redis } from "ioredis";
import { logger } from "../observability/logger.js";
import type { SeatBus, SeatMessage } from "./seat-bus.js";

const channelOf = (eventId: string) => `seats:${eventId}`;

/** Relays seat changes between API instances with Redis pub/sub. */
export class RedisSeatBus implements SeatBus {
  private handlers = new Map<string, Set<(message: SeatMessage) => void>>();
  private resetHandlers: (() => void)[] = [];
  private connectedBefore = false;

  constructor(
    private readonly pub: Redis,
    private readonly sub: Redis,
  ) {
    sub.on("message", (channel: string, raw: string) => {
      const eventId = channel.slice("seats:".length);
      let message: SeatMessage;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      for (const handler of this.handlers.get(eventId) ?? []) handler(message);
    });

    // ioredis resubscribes on its own after a reconnect, but anything published
    // while we were away is gone, so every stream must resync from a snapshot.
    sub.on("ready", () => {
      if (this.connectedBefore) {
        logger.warn("Seat bus reconnected to Redis; resyncing streams");
        for (const handler of this.resetHandlers) handler();
      }
      this.connectedBefore = true;
    });
  }

  async publish(message: SeatMessage) {
    await this.pub.publish(channelOf(message.eventId), JSON.stringify(message));
  }

  subscribe(eventId: string, handler: (message: SeatMessage) => void) {
    let set = this.handlers.get(eventId);
    if (!set) {
      set = new Set();
      this.handlers.set(eventId, set);
      this.sub.subscribe(channelOf(eventId)).catch((err) => logger.warn({ err, eventId }, "Subscribe failed"));
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0 && this.handlers.get(eventId) === set) {
        this.handlers.delete(eventId);
        this.sub.unsubscribe(channelOf(eventId)).catch(() => {});
      }
    };
  }

  onReset(handler: () => void) {
    this.resetHandlers.push(handler);
  }

  async ready() {
    return this.pub.status === "ready" && this.sub.status === "ready";
  }

  async close() {
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}
