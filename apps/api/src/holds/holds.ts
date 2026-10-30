import { pool } from "../db/client.js";

export const HOLD_MINUTES = 10;

export type HoldInput = {
  userId: string;
  eventId: string;
  seatIds: string[];
};

export type HoldResult =
  | { ok: true; seatIds: string[]; heldUntil: Date }
  | { ok: false; reason: "conflict" };

export async function holdSeats({ userId, eventId, seatIds }: HoldInput): Promise<HoldResult> {
  const ids = [...new Set(seatIds)];
  if (ids.length === 0) {
    throw new Error("seatIds must not be empty");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query<{ id: string; held_until: Date }>(
      `with locked as (
         select id from seats
         where id = any($2::uuid[])
           and event_id = $3
           and status = 'available'
           and (held_until is null or held_until < now())
         order by id
         for update skip locked
       )
       update seats s
       set held_by = $1,
           held_until = now() + $4::int * interval '1 minute',
           updated_at = now()
       from locked
       where s.id = locked.id
       returning s.id, s.held_until`,
      [userId, ids, eventId, HOLD_MINUTES],
    );

    if (rows.length !== ids.length) {
      await client.query("rollback");
      return { ok: false, reason: "conflict" };
    }

    await client.query("commit");
    return { ok: true, seatIds: rows.map((r) => r.id), heldUntil: rows[0].held_until };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
