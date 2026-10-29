import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
    currency: text("currency").notNull().default("INR"),
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
