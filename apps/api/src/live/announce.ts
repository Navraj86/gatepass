import { logger } from "../observability/logger.js";
import { readSeatChanges } from "../seats/seat-map.js";
import { seatBus } from "./seat-bus.js";

/**
 * Publishes the current state of seats that just changed. Call it after the
 * transaction commits; it reads committed state, so a message can never
 * announce something that was rolled back. Failures are logged, not thrown:
 * the live map is a view and must never fail a purchase.
 */
export async function announceSeats(eventId: string, seatIds: string[]) {
  if (seatIds.length === 0) return;
  try {
    const at = Date.now();
    const changes = await readSeatChanges(seatIds);
    await seatBus().publish({ eventId, at, changes });
  } catch (err) {
    logger.warn({ err, eventId }, "Could not announce seat changes");
  }
}
