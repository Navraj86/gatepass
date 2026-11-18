import type { NextFunction, Request, Response } from "express";
import client from "prom-client";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const seatHolds = new client.Counter({
  name: "seat_holds_total",
  help: "Seat hold attempts by result",
  labelNames: ["result"] as const,
  registers: [registry],
});

export const oversellsBlocked = new client.Counter({
  name: "oversell_attempts_blocked_total",
  help: "Times a safety net stopped a seat from being sold twice",
  labelNames: ["where"] as const,
  registers: [registry],
});

export const checkoutSessions = new client.Counter({
  name: "checkout_sessions_created_total",
  help: "Checkout session requests by result",
  labelNames: ["result"] as const,
  registers: [registry],
});

export const checkoutPayments = new client.Counter({
  name: "checkout_payments_total",
  help: "Payment outcomes by result",
  labelNames: ["result"] as const,
  registers: [registry],
});

export const ticketScans = new client.Counter({
  name: "ticket_scans_total",
  help: "Ticket scans by result",
  labelNames: ["result"] as const,
  registers: [registry],
});

export const sseConnections = new client.Gauge({
  name: "sse_connections",
  help: "Open seat map streams on this instance",
  registers: [registry],
});

export const sseUpdateLag = new client.Histogram({
  name: "sse_update_lag_seconds",
  help: "Time from database commit to the batch being written to clients",
  buckets: [0.05, 0.1, 0.25, 0.5, 0.75, 1, 2, 5],
  registers: [registry],
});

export const webhookEvents = new client.Counter({
  name: "webhook_events_total",
  help: "Payment webhooks by type and result",
  labelNames: ["type", "result"] as const,
  registers: [registry],
});

export const refundFailures = new client.Counter({
  name: "refund_failures_total",
  help: "Refund requests or refunds that failed and need a retry",
  registers: [registry],
});

export const emailsSent = new client.Counter({
  name: "emails_sent_total",
  help: "Ticket emails by result",
  labelNames: ["result"] as const,
  registers: [registry],
});

export function measureRequests(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    // Label by the matched route pattern, never the raw URL, to keep cardinality low.
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : "unmatched";
    end({ method: req.method, route, status: String(res.statusCode) });
  });
  next();
}
