import type { SeatChange } from "../seats/seat-map.js";

/** Collects changes between flushes; the last state of each seat wins. */
export class Coalescer {
  private pending = new Map<string, SeatChange>();
  private oldest: number | undefined;

  add(at: number, changes: SeatChange[]) {
    for (const change of changes) {
      this.pending.delete(change.seatId);
      this.pending.set(change.seatId, change);
    }
    this.oldest = Math.min(this.oldest ?? at, at);
  }

  get size() {
    return this.pending.size;
  }

  drain(): { changes: SeatChange[]; oldest: number | undefined } {
    const changes = [...this.pending.values()];
    const oldest = this.oldest;
    this.pending.clear();
    this.oldest = undefined;
    return { changes, oldest };
  }
}
