/** The shapes the API returns, matching apps/api (staff routes and tickets/scan.ts). */

export type Role = "attendee" | "organizer" | "staff";

export type User = { id: string; email: string; name: string; role: Role };

export type StaffEvent = {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  validTickets: number;
  checkedIn: number;
};

type Seat = { sectionName: string; rowLabel: string; seatNumber: number };

export type ScanResult =
  | { result: "valid"; seat: Seat; holderName: string }
  | { result: "duplicate"; seat: Seat; scannedAt: string; scannedByName: string }
  | { result: "refunded"; seat: Seat }
  | { result: "wrong_event"; eventTitle: string }
  | { result: "invalid" };
