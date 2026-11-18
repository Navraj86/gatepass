import type { Request, Response } from "express";
import { logger } from "../observability/logger.js";
import { sseConnections, sseUpdateLag } from "../observability/metrics.js";
import { readSeatMap, type SeatChange } from "../seats/seat-map.js";
import { Coalescer } from "./coalescer.js";
import { seatBus, type SeatBus, type SeatMessage } from "./seat-bus.js";

export const BATCH_MS = 250;
export const HEARTBEAT_MS = 25_000;
const RETRY_MS = 3_000;

type Client = {
  res: Response;
  /** True until the snapshot is written; changes arriving meanwhile wait in `backlog`. */
  catchingUp: boolean;
  backlog: Coalescer;
};

type Channel = {
  clients: Set<Client>;
  batch: Coalescer;
  timer?: NodeJS.Timeout;
  unsubscribe: () => void;
};

/**
 * Fans out seat changes to this instance's open streams. Each instance holds
 * one bus subscription per event, however many browsers are watching it.
 */
class SeatStreamHub {
  private channels = new Map<string, Channel>();
  private heartbeat?: NodeJS.Timeout;
  private hookedBus?: SeatBus;

  add(eventId: string, client: Client) {
    this.hookReset();
    let channel = this.channels.get(eventId);
    if (!channel) {
      const created: Channel = {
        clients: new Set(),
        batch: new Coalescer(),
        unsubscribe: () => {},
      };
      created.unsubscribe = seatBus().subscribe(eventId, (message) => this.receive(created, message));
      this.channels.set(eventId, created);
      channel = created;
    }
    channel.clients.add(client);
    sseConnections.inc();
    this.startHeartbeat();
  }

  remove(eventId: string, client: Client) {
    const channel = this.channels.get(eventId);
    if (!channel?.clients.delete(client)) return;
    sseConnections.dec();
    if (channel.clients.size === 0) {
      clearTimeout(channel.timer);
      channel.unsubscribe();
      this.channels.delete(eventId);
    }
    if (this.channels.size === 0) this.stopHeartbeat();
  }

  /** Ends every stream; browsers reconnect (to any instance) and get a fresh snapshot. */
  closeAll() {
    for (const [eventId, channel] of this.channels) {
      for (const client of [...channel.clients]) {
        client.res.end();
        this.remove(eventId, client);
      }
    }
  }

  get connectionCount() {
    let count = 0;
    for (const channel of this.channels.values()) count += channel.clients.size;
    return count;
  }

  private receive(channel: Channel, message: SeatMessage) {
    channel.batch.add(message.at, message.changes);
    channel.timer ??= setTimeout(() => this.flush(channel), BATCH_MS);
  }

  private flush(channel: Channel) {
    channel.timer = undefined;
    const { changes, oldest } = channel.batch.drain();
    if (changes.length === 0) return;
    for (const client of channel.clients) {
      if (client.catchingUp) {
        client.backlog.add(oldest ?? Date.now(), changes);
      } else {
        writeChanges(client.res, changes);
      }
    }
    if (oldest !== undefined) sseUpdateLag.observe((Date.now() - oldest) / 1000);
  }

  private hookReset() {
    const bus = seatBus();
    if (this.hookedBus === bus) return;
    this.hookedBus = bus;
    bus.onReset(() => {
      logger.warn({ streams: this.connectionCount }, "Seat bus reset; closing streams so clients resync");
      this.closeAll();
    });
  }

  private startHeartbeat() {
    // Cloudflare drops idle proxied connections after about 100 seconds.
    this.heartbeat ??= setInterval(() => {
      for (const channel of this.channels.values()) {
        for (const client of channel.clients) client.res.write(": ping\n\n");
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }
}

export const hub = new SeatStreamHub();

function writeChanges(res: Response, changes: SeatChange[]) {
  res.write(`event: changes\ndata: ${JSON.stringify(changes)}\n\n`);
}

/**
 * GET /api/events/:eventId/seats/stream. Subscribe first, then read the
 * snapshot, then flush whatever arrived in between, so no change can fall
 * into the gap between the snapshot and the live stream.
 */
export async function streamSeats(req: Request, res: Response, eventId: string) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: ${RETRY_MS}\n\n`);

  const client: Client = { res, catchingUp: true, backlog: new Coalescer() };
  hub.add(eventId, client);
  req.on("close", () => hub.remove(eventId, client));

  try {
    const seats = await readSeatMap(eventId);
    res.write(`event: snapshot\ndata: ${JSON.stringify({ seats })}\n\n`);
    const { changes } = client.backlog.drain();
    if (changes.length > 0) writeChanges(res, changes);
    client.catchingUp = false;
  } catch (err) {
    req.log.error({ err, eventId }, "Could not send seat snapshot");
    hub.remove(eventId, client);
    res.end();
  }
}
