import type { SeatChange } from "../seats/seat-map.js";

/** A batch of seat changes for one event, stamped with the time it was read after commit. */
export type SeatMessage = { eventId: string; at: number; changes: SeatChange[] };

/**
 * Relays seat changes between API instances. It is best effort: PostgreSQL
 * decides every seat, and a missed message only costs a client a 409.
 */
export interface SeatBus {
  publish(message: SeatMessage): Promise<void>;
  /** Subscribes to one event's changes; returns the unsubscribe function. */
  subscribe(eventId: string, handler: (message: SeatMessage) => void): () => void;
  /** Called when messages may have been lost (Redis reconnect); streams must resync. */
  onReset(handler: () => void): void;
  ready(): Promise<boolean>;
  close(): Promise<void>;
}

export class MemorySeatBus implements SeatBus {
  private handlers = new Map<string, Set<(message: SeatMessage) => void>>();
  private resetHandlers: (() => void)[] = [];

  async publish(message: SeatMessage) {
    for (const handler of this.handlers.get(message.eventId) ?? []) {
      queueMicrotask(() => handler(message));
    }
  }

  subscribe(eventId: string, handler: (message: SeatMessage) => void) {
    const set = this.handlers.get(eventId) ?? new Set();
    set.add(handler);
    this.handlers.set(eventId, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(eventId);
    };
  }

  onReset(handler: () => void) {
    this.resetHandlers.push(handler);
  }

  /** Test hook: simulates a lost connection. */
  reset() {
    for (const handler of this.resetHandlers) handler();
  }

  async ready() {
    return true;
  }

  async close() {
    this.handlers.clear();
  }
}

let current: SeatBus = new MemorySeatBus();

export function seatBus(): SeatBus {
  return current;
}

export function setSeatBus(bus: SeatBus) {
  current = bus;
}
