export type Role = "attendee" | "organizer" | "staff";

export type User = { id: string; email: string; name: string; role: Role };

export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  startsAt: string;
  saleStartsAt: string;
  status: "draft" | "published" | "cancelled";
  currency: string;
  fromPriceMinor?: number | null;
};

export type Section = { id: string; name: string; priceMinor: number };

export type OrderStatus = "pending" | "paid" | "expired" | "cancelled" | "failed" | "refunding" | "refunded";

export type Ticket = {
  id: string;
  code: string;
  status: "valid" | "refunded";
  scannedAt: string | null;
  sectionName: string;
  rowLabel: string;
  seatNumber: number;
};

export type Order = {
  id: string;
  eventId: string;
  eventTitle: string;
  venue: string;
  startsAt: string;
  status: OrderStatus;
  amountMinor: number;
  currency: string;
  chargedAmountMinor: number | null;
  chargedCurrency: string | null;
  failureCode: string | null;
  expiresAt: string;
  paidAt: string | null;
};
