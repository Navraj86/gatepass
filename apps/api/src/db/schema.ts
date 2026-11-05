import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestamps = {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

export const eventStatus = pgEnum("event_status", ["draft", "published", "cancelled"]);

export const events = pgTable("events", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: text("oganizer_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    venue: text("venue").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    saleStartsAt: timestamp("sale_starts_at", { withTimezone: true }).notNull(),
    status: eventStatus("status").notNull().default("draft"),
    currency: text("currency").notNull().default("USD"),
    ...timestamps,
});

export const sections = pgTable("sections", {
        id: uuid("id").primaryKey().defaultRandom(),
        eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        priceMinor: integer("price_minor").notNull(),
        ...timestamps,
    },
    (t) => [
        unique("sections_event_name_unique").on(t.eventId, t.name),
        check("sections_price_non_negative", sql`${t.priceMinor} >= 0`),
    ],
);

export const seatStatus = pgEnum("seat_status", ["available", "sold", "blocked"]);

export const seats = pgTable("seats", {
        id: uuid("id").primaryKey().defaultRandom(),
        eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
        sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "cascade" }),
        rowLabel: text("row_label").notNull(),
        seatNumber: integer("seat_number").notNull(),
        status: seatStatus("status").notNull().default("available"),
        heldBy: text("held_by"),
        heldUntil: timestamp("held_until", { withTimezone: true }),
        ...timestamps,
    },
    (t) => [
        unique("seats_position_unique").on(t.sectionId, t.rowLabel, t.seatNumber),
        index("seats_event_id_idx").on(t.eventId),
        check("seats_number_positive", sql`${t.seatNumber} >= 0`),
        check("seats_hold_pair", sql`(${t.heldBy} is null) = (${t.heldUntil} is null)`),
    ],
);

export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "expired",
  "cancelled",
  "failed",
  "refunding",
  "refunded",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    status: orderStatus("status").notNull().default("pending"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    dodoSessionId: text("dodo_session_id").unique(),
    dodoPaymentId: text("dodo_payment_id").unique(),
    checkoutUrl: text("checkout_url"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    chargedAmountMinor: integer("charged_amount_minor"),
    chargedCurrency: text("charged_currency"),
    chargedTaxMinor: integer("charged_tax_minor"),
    failureCode: text("failure_code"),
    dodoRefundId: text("dodo_refund_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_one_pending_per_user_event")
      .on(t.userId, t.eventId)
      .where(sql`${t.status} = 'pending'`),
    index("orders_user_id_idx").on(t.userId),
    index("orders_event_id_idx").on(t.eventId),
    check("orders_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "orders_paid_at_matches_status",
      sql`(${t.status} in ('paid', 'refunding', 'refunded')) = (${t.paidAt} is not null)`,
    ),
    check(
      "orders_charged_pair",
      sql`(${t.chargedAmountMinor} is null) = (${t.chargedCurrency} is null)`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "restrict" }),
    priceMinor: integer("price_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.seatId] }),
    check("order_items_price_non_negative", sql`${t.priceMinor} >= 0`),
  ],
);

export const ticketStatus = pgEnum("ticket_status", ["valid", "refunded"]);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "restrict" }),
    code: text("code").notNull().unique(),
    status: ticketStatus("status").notNull().default("valid"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    scannedBy: text("scanned_by"), // link to users added with auth in Week 4
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tickets_one_valid_per_seat")
      .on(t.seatId)
      .where(sql`${t.status} = 'valid'`),
    index("tickets_event_id_idx").on(t.eventId),
    index("tickets_order_id_idx").on(t.orderId),
    check("tickets_scan_pair", sql`(${t.scannedAt} is null) = (${t.scannedBy} is null)`),
    check(
      "tickets_no_refund_after_scan",
      sql`not (${t.status} = 'refunded' and ${t.scannedAt} is not null)`,
    ),
  ],
);
