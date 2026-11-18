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

export type OrganizerEvent = PublicEvent & { createdAt: string; seatCount?: number; soldCount?: number };

export type OrganizerSection = Section & {
  seatCount: number;
  rowCount: number;
  firstRow: string | null;
  lastRow: string | null;
};

export type EventStats = {
  totalSeats: number;
  sold: number;
  held: number;
  revenueMinor: number;
  checkedIn: number;
  validTickets: number;
  paidOrders: number;
  refundingOrders: number;
};

export type OrganizerOrder = {
  id: string;
  status: OrderStatus;
  amountMinor: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  buyerName: string;
  buyerEmail: string;
  seatCount: number;
  scannedCount: number;
};

export type StaffMember = { id: string; name: string; email: string };

export type StaffEvent = {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  validTickets: number;
  checkedIn: number;
};

type ScannedSeat = { sectionName: string; rowLabel: string; seatNumber: number };

export type ScanResult =
  | { result: "valid"; seat: ScannedSeat; holderName: string }
  | { result: "duplicate"; seat: ScannedSeat; scannedAt: string; scannedByName: string }
  | { result: "refunded"; seat: ScannedSeat }
  | { result: "wrong_event"; eventTitle: string }
  | { result: "invalid" };
