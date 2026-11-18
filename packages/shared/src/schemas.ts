import { z } from "zod";

/** Validation shared by the API and the web app, so both check the same rules. */

export const MAX_SEATS_PER_ORDER = 6;

export const holdSeatsSchema = z.object({
  seatIds: z.array(z.uuid()).min(1).max(MAX_SEATS_PER_ORDER),
});
export type HoldSeatsInput = z.infer<typeof holdSeatsSchema>;

export const checkoutSchema = z.object({
  eventId: z.uuid(),
  email: z.email("Enter a valid email"),
  name: z.string().trim().min(1, "Enter your name").max(100),
  country: z.string().regex(/^[A-Z]{2}$/, "Choose a country"),
  zipcode: z.string().trim().min(3, "Enter a postal code").max(12),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

const futureDate = z.coerce.date();

const eventFields = {
  title: z.string().trim().min(3, "Title is too short").max(120),
  description: z.string().trim().max(2000).optional(),
  venue: z.string().trim().min(2, "Enter a venue").max(200),
  startsAt: futureDate,
  saleStartsAt: futureDate,
};

export const createEventSchema = z
  .object(eventFields)
  .refine((e) => e.saleStartsAt < e.startsAt, {
    path: ["saleStartsAt"],
    message: "Sales must open before the event starts",
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object(eventFields).partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const MAX_SEATS_PER_EVENT = 5000;

export const createSectionSchema = z.object({
  name: z.string().trim().min(1, "Name the section").max(60),
  priceMinor: z.number().int().min(50, "Minimum price is 0.50").max(1_000_000),
  rows: z.number().int().min(1).max(60),
  seatsPerRow: z.number().int().min(1).max(100),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const publishEventSchema = z.object({
  saleStartsAt: z.coerce.date().optional(),
});

export const assignStaffSchema = z.object({
  email: z.email("Enter a valid email"),
});

export const scanSchema = z.object({
  eventId: z.uuid(),
  code: z.string().trim().min(1).max(64),
});
export type ScanInput = z.infer<typeof scanSchema>;
