import { pool } from "../db/client.js";

export type SeatState = "available" | "held" | "sold" | "blocked";

/**
 * A seat's visible state is derived, never stored twice: a hold is an
 * available seat whose held_until is in the future, so an expired hold
 * needs no cleanup job.
 */
const derivedState = `
  case
    when s.status = 'sold' then 'sold'
    when s.status = 'blocked' then 'blocked'
    when s.held_until > now() then 'held'
    else 'available'
  end`;

const derivedHeldUntil = `case when s.status = 'available' and s.held_until > now() then s.held_until end`;

export type SeatMapSeat = {
  id: string;
  rowLabel: string;
  seatNumber: number;
  sectionId: string;
  sectionName: string;
  priceMinor: number;
  state: SeatState;
  heldUntil: Date | null;
};

export async function readSeatMap(eventId: string): Promise<SeatMapSeat[]> {
  const { rows } = await pool.query<SeatMapSeat>(
    `select s.id, s.row_label as "rowLabel", s.seat_number as "seatNumber",
            sec.id as "sectionId", sec.name as "sectionName", sec.price_minor as "priceMinor",
            ${derivedState} as state,
            ${derivedHeldUntil} as "heldUntil"
     from seats s
     join sections sec on sec.id = s.section_id
     where s.event_id = $1
     order by sec.price_minor desc, sec.name, s.row_label, s.seat_number`,
    [eventId],
  );
  return rows;
}

export type SeatChange = { seatId: string; state: SeatState; heldUntil: string | null };

export async function readSeatChanges(seatIds: string[]): Promise<SeatChange[]> {
  const { rows } = await pool.query<{ seatId: string; state: SeatState; heldUntil: Date | null }>(
    `select s.id as "seatId", ${derivedState} as state, ${derivedHeldUntil} as "heldUntil"
     from seats s where s.id = any($1::uuid[])`,
    [seatIds],
  );
  return rows.map((r) => ({ ...r, heldUntil: r.heldUntil?.toISOString() ?? null }));
}
