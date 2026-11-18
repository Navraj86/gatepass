export type SeatState = "available" | "held" | "sold" | "blocked";

/** One seat change as sent on the live stream. No user ids ever leave the server. */
export type SeatChange = { seatId: string; state: SeatState; heldUntil: string | null };

export type SeatMapSeat = {
  id: string;
  rowLabel: string;
  seatNumber: number;
  sectionId: string;
  sectionName: string;
  priceMinor: number;
  state: SeatState;
  heldUntil: string | null;
};

/** A hold whose time has passed is available again; the browser flips it itself. */
export function visibleState(seat: { state: SeatState; heldUntil: string | null }, now = Date.now()): SeatState {
  if (seat.state === "held" && seat.heldUntil && Date.parse(seat.heldUntil) <= now) return "available";
  return seat.state;
}
