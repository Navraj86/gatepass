import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
