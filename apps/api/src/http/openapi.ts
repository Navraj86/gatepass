import {
  assignStaffSchema,
  checkoutSchema,
  createEventSchema,
  createSectionSchema,
  holdSeatsSchema,
  publishEventSchema,
  scanSchema,
  updateEventSchema,
} from "@gatepass/shared";
import { Router } from "express";
import { z } from "zod";

type Access = "public" | "attendee" | "owner" | "organizer" | "staff" | "dodo";

type Operation = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  tag: string;
  access: Access;
  body?: z.ZodType;
};

/**
 * The API surface, documented from the same Zod schemas that validate requests.
 * Responses are summarised; every error is application/problem+json.
 */
const operations: Operation[] = [
  { method: "get", path: "/api/events", summary: "Published events", tag: "Events", access: "public" },
  { method: "get", path: "/api/events/{eventId}", summary: "Event details, sections and prices", tag: "Events", access: "public" },
  { method: "get", path: "/api/events/{eventId}/seats", summary: "Seat map snapshot", tag: "Events", access: "public" },
  {
    method: "get",
    path: "/api/events/{eventId}/seats/stream",
    summary: "Server-sent events: a snapshot, then changes batched every 250 ms",
    tag: "Events",
    access: "public",
  },
  { method: "post", path: "/api/events/{eventId}/holds", summary: "Hold seats (at most 6)", tag: "Holds", access: "attendee", body: holdSeatsSchema },
  { method: "get", path: "/api/events/{eventId}/holds", summary: "My active holds", tag: "Holds", access: "attendee" },
  { method: "delete", path: "/api/events/{eventId}/holds", summary: "Release my holds", tag: "Holds", access: "attendee" },
  { method: "post", path: "/api/orders", summary: "Create an order and a Dodo checkout session", tag: "Orders", access: "attendee", body: checkoutSchema },
  { method: "get", path: "/api/orders/{orderId}", summary: "Order status and tickets", tag: "Orders", access: "owner" },
  { method: "post", path: "/api/orders/{orderId}/cancel", summary: "Cancel a pending order and release its seats", tag: "Orders", access: "owner" },
  { method: "post", path: "/api/orders/{orderId}/resend-email", summary: "Resend the ticket email", tag: "Orders", access: "owner" },
  { method: "get", path: "/api/me", summary: "The signed-in user", tag: "Account", access: "attendee" },
  { method: "get", path: "/api/me/tickets", summary: "All my tickets", tag: "Account", access: "attendee" },
  { method: "get", path: "/api/me/orders", summary: "My recent orders", tag: "Account", access: "attendee" },
  { method: "get", path: "/api/organizer/events", summary: "My events", tag: "Organizer", access: "organizer" },
  { method: "post", path: "/api/organizer/events", summary: "Create a draft event", tag: "Organizer", access: "organizer", body: createEventSchema },
  { method: "get", path: "/api/organizer/events/{eventId}", summary: "Event with sections", tag: "Organizer", access: "organizer" },
  { method: "patch", path: "/api/organizer/events/{eventId}", summary: "Edit a draft event", tag: "Organizer", access: "organizer", body: updateEventSchema },
  {
    method: "post",
    path: "/api/organizer/events/{eventId}/sections",
    summary: "Add a section and generate its seat grid",
    tag: "Organizer",
    access: "organizer",
    body: createSectionSchema,
  },
  { method: "delete", path: "/api/organizer/events/{eventId}/sections/{sectionId}", summary: "Remove a section from a draft", tag: "Organizer", access: "organizer" },
  { method: "post", path: "/api/organizer/events/{eventId}/publish", summary: "Publish with an on-sale time", tag: "Organizer", access: "organizer", body: publishEventSchema },
  { method: "get", path: "/api/organizer/events/{eventId}/stats", summary: "Sold, held, revenue, checked in", tag: "Organizer", access: "organizer" },
  { method: "get", path: "/api/organizer/events/{eventId}/orders", summary: "Orders, paginated", tag: "Organizer", access: "organizer" },
  { method: "post", path: "/api/organizer/orders/{orderId}/refund", summary: "Refund an order (retry-safe)", tag: "Organizer", access: "organizer" },
  { method: "get", path: "/api/organizer/events/{eventId}/staff", summary: "Assigned staff", tag: "Organizer", access: "organizer" },
  { method: "post", path: "/api/organizer/events/{eventId}/staff", summary: "Assign a staff account by email", tag: "Organizer", access: "organizer", body: assignStaffSchema },
  { method: "delete", path: "/api/organizer/events/{eventId}/staff/{userId}", summary: "Unassign staff", tag: "Organizer", access: "organizer" },
  { method: "get", path: "/api/staff/events", summary: "Events I can scan", tag: "Staff", access: "staff" },
  { method: "post", path: "/api/staff/scan", summary: "Check in a ticket code (exactly once)", tag: "Staff", access: "staff", body: scanSchema },
  { method: "post", path: "/api/webhooks/dodo", summary: "Signed Dodo Payments webhooks (Standard Webhooks)", tag: "Webhooks", access: "dodo" },
  { method: "get", path: "/api/health/live", summary: "Process is up", tag: "Health", access: "public" },
  { method: "get", path: "/api/health/ready", summary: "Database and seat bus reachable", tag: "Health", access: "public" },
];

const accessNote: Record<Access, string> = {
  public: "Anyone.",
  attendee: "Signed-in user.",
  owner: "The signed-in owner of the order.",
  organizer: "Organizer who owns the event.",
  staff: "Staff assigned to the event, or its organizer.",
  dodo: "Dodo Payments only; verified by signature.",
};

function jsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
    override: (ctx) => {
      // Dates travel as ISO 8601 strings.
      if (ctx.zodSchema._zod.def.type === "date") {
        ctx.jsonSchema.type = "string";
        ctx.jsonSchema.format = "date-time";
      }
    },
  });
}

function buildDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    const params = [...op.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
    }));
    paths[op.path] ??= {};
    paths[op.path][op.method] = {
      summary: op.summary,
      description: accessNote[op.access],
      tags: [op.tag],
      security: op.access === "public" || op.access === "dodo" ? [] : [{ session: [] }],
      parameters: params.length ? params : undefined,
      requestBody: op.body
        ? { required: true, content: { "application/json": { schema: jsonSchema(op.body) } } }
        : undefined,
      responses: {
        "2XX": { description: "Success" },
        default: {
          description: "Error",
          content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Gatepass API",
      version: "1.0.0",
      description: "Flash-sale ticketing with zero oversells. Authentication is a Better Auth session cookie.",
    },
    paths,
    components: {
      securitySchemes: { session: { type: "apiKey", in: "cookie", name: "better-auth.session_token" } },
      schemas: {
        Problem: {
          type: "object",
          required: ["status", "code", "detail"],
          properties: {
            type: { type: "string" },
            title: { type: "string" },
            status: { type: "integer" },
            code: { type: "string", description: "Stable machine-readable error code" },
            detail: { type: "string" },
          },
        },
      },
    },
  };
}

export const docsRouter = Router();
const document = buildDocument();

docsRouter.get("/openapi.json", (_req, res) => {
  res.json(document);
});

docsRouter.get("/docs", (_req, res) => {
  res
    .setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src https://fonts.gstatic.com https://cdn.jsdelivr.net data:; img-src 'self' data:; connect-src 'self'",
    )
    .type("html")
    .send(`<!doctype html>
<html>
  <head>
    <title>Gatepass API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/api/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.80.0"></script>
  </body>
</html>`);
});
