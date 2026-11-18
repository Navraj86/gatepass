import { CODE_ALPHABET, CODE_LENGTH, normalizeTicketCode } from "@gatepass/shared";
import { pool } from "../db/client.js";
import { ticketScans } from "../observability/metrics.js";

type Seat = { sectionName: string; rowLabel: string; seatNumber: number };

export type ScanResult =
  | { result: "valid"; seat: Seat; holderName: string }
  | { result: "duplicate"; seat: Seat; scannedAt: Date; scannedByName: string }
  | { result: "refunded"; seat: Seat }
  | { result: "wrong_event"; eventTitle: string }
  | { result: "invalid" };

const validCode = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * Exactly-once check-in is one conditional UPDATE: only the first scan of a
 * valid, unscanned ticket gets a row back. Every other outcome is explained by
 * one follow-up read.
 */
export async function scanTicket({
  eventId,
  rawCode,
  staffId,
}: {
  eventId: string;
  rawCode: string;
  staffId: string;
}): Promise<ScanResult> {
  const result = await scan(eventId, rawCode, staffId);
  ticketScans.inc({ result: result.result });
  return result;
}

async function scan(eventId: string, rawCode: string, staffId: string): Promise<ScanResult> {
  const code = normalizeTicketCode(rawCode);
  if (!validCode.test(code)) return { result: "invalid" };

  const claimed = await pool.query<Seat & { holderName: string }>(
    `with scanned as (
       update tickets set scanned_at = now(), scanned_by = $3, updated_at = now()
       where code = $1 and event_id = $2 and status = 'valid' and scanned_at is null
       returning seat_id, order_id
     )
     select sec.name as "sectionName", s.row_label as "rowLabel", s.seat_number as "seatNumber",
            u.name as "holderName"
     from scanned
     join seats s on s.id = scanned.seat_id
     join sections sec on sec.id = s.section_id
     join orders o on o.id = scanned.order_id
     join "user" u on u.id = o.user_id`,
    [code, eventId, staffId],
  );
  if (claimed.rows[0]) {
    const { holderName, ...seat } = claimed.rows[0];
    return { result: "valid", seat, holderName };
  }

  const found = await pool.query<
    Seat & {
      eventId: string;
      eventTitle: string;
      status: string;
      scannedAt: Date | null;
      scannedByName: string | null;
    }
  >(
    `select t.event_id as "eventId", e.title as "eventTitle", t.status, t.scanned_at as "scannedAt",
            sb.name as "scannedByName", sec.name as "sectionName", s.row_label as "rowLabel",
            s.seat_number as "seatNumber"
     from tickets t
     join events e on e.id = t.event_id
     join seats s on s.id = t.seat_id
     join sections sec on sec.id = s.section_id
     left join "user" sb on sb.id = t.scanned_by
     where t.code = $1`,
    [code],
  );
  const ticket = found.rows[0];
  if (!ticket) return { result: "invalid" };
  if (ticket.eventId !== eventId) return { result: "wrong_event", eventTitle: ticket.eventTitle };

  const seat = { sectionName: ticket.sectionName, rowLabel: ticket.rowLabel, seatNumber: ticket.seatNumber };
  if (ticket.status === "refunded") return { result: "refunded", seat };
  return {
    result: "duplicate",
    seat,
    scannedAt: ticket.scannedAt!,
    scannedByName: ticket.scannedByName ?? "staff",
  };
}
