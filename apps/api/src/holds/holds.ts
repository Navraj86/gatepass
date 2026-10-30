import { pool } from "../db/client.js";

export const HOLD_MINUTES = 10;
export const MAX_SEATS_PER_USER = 6;

export type HoldInput = {
  userId: string;
  eventId: string;
  seatIds: string[];
};

export type HoldFailure = "conflict" | "not_on_sale" | "limit_exceeded";

export type HoldResult =
  | { ok: true; seatIds: string[]; heldUntil: Date }
  | { ok: false; reason: HoldFailure };

export async function holdSeats({ userId, eventId, seatIds }: HoldInput): Promise<HoldResult> {
  const ids = [...new Set(seatIds)];
  if (ids.length === 0) {
    throw new Error("seatIds must not be empty");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '2s'");

    const fail = async (reason: HoldFailure): Promise<HoldResult> => {
      await client.query("rollback");
      return { ok: false, reason };
    };

    const event = await client.query<{ on_sale: boolean }>(
      `select status = 'published' and sale_starts_at <= now() as on_sale
       from events where id = $1`,
      [eventId],
    );
    if (!event.rows[0]?.on_sale) {
      return await fail("not_on_sale");
    }

    await client.query("select pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
      userId,
      eventId,
    ]);

    const held = await client.query<{ count: number }>(
      `select count(*)::int as count from seats
       where event_id = $1 and held_by = $2
         and status = 'available' and held_until > now()`,
      [eventId, userId],
    );
    if (held.rows[0].count + ids.length > MAX_SEATS_PER_USER) {
      return await fail("limit_exceeded");
    }

    const { rows } = await client.query<{ id: string; held_until: Date }>(
      `with locked as (
         select id from seats
         where id = any($2::uuid[])
           and event_id = $3
           and status = 'available'
           and (held_until is null or held_until < now())
         order by id
         for update
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
      return await fail("conflict");
    }

    await client.query("commit");
    return { ok: true, seatIds: rows.map((r) => r.id), heldUntil: rows[0].held_until };
  } catch (err) {
    await client.query("rollback");
    if (isLockTimeout(err)) {
      return { ok: false, reason: "conflict" };
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function releaseHolds({
  userId,
  eventId,
}: {
  userId: string;
  eventId: string;
}): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `update seats
     set held_by = null, held_until = null, updated_at = now()
     where event_id = $1 and held_by = $2 and status = 'available'
     returning id`,
    [eventId, userId],
  );
  return rows.map((r) => r.id);
}

function isLockTimeout(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "55P03";
}
