"use client";

import { type SeatChange, type SeatMapSeat, type SeatState, visibleState } from "@gatepass/shared";
import { useCallback, useEffect, useMemo, useState } from "react";

type Live = { state: SeatState; heldUntil: string | null };
export type StreamStatus = "connecting" | "live" | "reconnecting";

function toMap(seats: SeatMapSeat[]) {
  return new Map<string, Live>(seats.map((s) => [s.id, { state: s.state, heldUntil: s.heldUntil }]));
}

/**
 * The seat map is a view: it starts from the server-rendered snapshot, then
 * follows the SSE stream. PostgreSQL decides every seat; a stale view only
 * ever costs the buyer a 409.
 */
export function useLiveSeats(eventId: string, initial: SeatMapSeat[]) {
  const [live, setLive] = useState(() => toMap(initial));
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [now, setNow] = useState(() => Date.now());

  const applySnapshot = useCallback((seats: SeatMapSeat[]) => setLive(toMap(seats)), []);

  useEffect(() => {
    const source = new EventSource(`/api/events/${eventId}/seats/stream`);
    source.addEventListener("snapshot", (e) => {
      applySnapshot(JSON.parse((e as MessageEvent).data).seats);
      setStatus("live");
    });
    source.addEventListener("changes", (e) => {
      const changes: SeatChange[] = JSON.parse((e as MessageEvent).data);
      setLive((prev) => {
        const next = new Map(prev);
        for (const c of changes) next.set(c.seatId, { state: c.state, heldUntil: c.heldUntil });
        return next;
      });
    });
    // The browser reconnects by itself (the server sends retry: 3000) and gets a fresh snapshot.
    source.onerror = () => setStatus("reconnecting");
    return () => source.close();
  }, [eventId, applySnapshot]);

  // Holds expire in the browser: no server event is needed when a hold runs out.
  const hasHolds = useMemo(() => [...live.values()].some((s) => s.state === "held"), [live]);
  useEffect(() => {
    if (!hasHolds) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasHolds]);

  const stateOf = useCallback(
    (seatId: string): SeatState => {
      const seat = live.get(seatId);
      return seat ? visibleState(seat, now) : "sold";
    },
    [live, now],
  );

  return { stateOf, status, applySnapshot, now };
}
