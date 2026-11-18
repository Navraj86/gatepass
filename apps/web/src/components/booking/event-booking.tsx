"use client";

import { MAX_SEATS_PER_ORDER, type SeatMapSeat } from "@gatepass/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth";
import { OnSaleLabel } from "@/components/on-sale-label";
import { SeatLegend, SeatMap } from "@/components/seat-map/seat-map";
import { useLiveSeats } from "@/components/seat-map/use-live-seats";
import { Button, Card, Notice } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatCountdown, formatMoney } from "@/lib/format";
import type { PublicEvent } from "@/lib/types";
import { BestAvailable } from "./best-available";
import { CheckoutForm } from "./checkout-form";

type Props = { event: PublicEvent; initialSeats: SeatMapSeat[] };

export function EventBooking({ event, initialSeats }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { stateOf, status, applySnapshot, now } = useLiveSeats(event.id, initialSeats);

  const [onSale, setOnSale] = useState(() => Date.parse(event.saleStartsAt) <= Date.now());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mine, setMine] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState<{ tone: "error" | "ok" | "info"; text: string }>();
  const [busy, setBusy] = useState(false);

  const seatsById = useMemo(() => new Map(initialSeats.map((s) => [s.id, s])), [initialSeats]);
  const describe = useCallback(
    (id: string) => {
      const s = seatsById.get(id);
      return s ? `${s.sectionName}, row ${s.rowLabel}, seat ${s.seatNumber}` : "a seat";
    },
    [seatsById],
  );

  // Restore holds after a reload.
  useEffect(() => {
    if (!user) return;
    api<{ holds: { seatId: string; heldUntil: string }[] }>(`/api/events/${event.id}/holds`)
      .then(({ holds }) => setMine(new Map(holds.map((h) => [h.seatId, h.heldUntil]))))
      .catch(() => {});
  }, [user, event.id]);

  const holdEndsAt = useMemo(() => Math.min(...[...mine.values()].map((t) => Date.parse(t))), [mine]);
  const holdLeft = mine.size > 0 ? holdEndsAt - now : 0;

  useEffect(() => {
    if (mine.size > 0 && holdLeft <= 0) {
      setMine(new Map());
      setMessage({ tone: "info", text: "Your hold ran out and the seats were released." });
    }
  }, [mine.size, holdLeft]);

  // A selected seat someone else just took drops out of the selection.
  useEffect(() => {
    const lost = [...selected].filter((id) => stateOf(id) !== "available");
    if (lost.length === 0) return;
    setSelected((prev) => new Set([...prev].filter((id) => !lost.includes(id))));
    setMessage({ tone: "info", text: `${lost.map(describe).join(", ")} was just taken by someone else.` });
  }, [selected, stateOf, describe]);

  const room = MAX_SEATS_PER_ORDER - mine.size;
  const toggle = useCallback(
    (id: string) => {
      setMessage(undefined);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else if (next.size < room) next.add(id);
        else setMessage({ tone: "info", text: `You can hold at most ${MAX_SEATS_PER_ORDER} seats.` });
        return next;
      });
    },
    [room],
  );

  function requireSignIn() {
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
  }

  async function hold() {
    if (!user) return requireSignIn();
    setBusy(true);
    setMessage(undefined);
    const wanted = [...selected];
    try {
      const result = await api<{ seatIds: string[]; heldUntil: string }>(`/api/events/${event.id}/holds`, {
        method: "POST",
        body: { seatIds: wanted },
      });
      setMine((prev) => {
        const next = new Map(prev);
        for (const id of result.seatIds) next.set(id, result.heldUntil);
        return next;
      });
      setSelected(new Set());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return requireSignIn();
      if (err instanceof ApiError && err.code === "conflict") {
        // Re-read the truth, then keep whatever is still free.
        const { seats } = await api<{ seats: SeatMapSeat[] }>(`/api/events/${event.id}/seats`);
        applySnapshot(seats);
        const free = new Set(seats.filter((s) => s.state === "available").map((s) => s.id));
        const lost = wanted.filter((id) => !free.has(id));
        setSelected(new Set(wanted.filter((id) => free.has(id))));
        setMessage({
          tone: "error",
          text: `${lost.map(describe).join(", ") || "A seat"} was just taken. The rest of your selection is still here.`,
        });
      } else {
        setMessage({ tone: "error", text: errorMessage(err) });
      }
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    try {
      await api(`/api/events/${event.id}/holds`, { method: "DELETE" });
      setMine(new Map());
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const priceOf = (id: string) => seatsById.get(id)?.priceMinor ?? 0;
  const selectedTotal = [...selected].reduce((sum, id) => sum + priceOf(id), 0);
  const heldTotal = [...mine.keys()].reduce((sum, id) => sum + priceOf(id), 0);
  const mineSet = useMemo(() => new Set(mine.keys()), [mine]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SeatLegend />
          <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
            <span className={`size-2 rounded-full ${status === "live" ? "bg-ok" : "bg-warn animate-pulse"}`} />
            {status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <SeatMap
            seats={initialSeats}
            stateOf={stateOf}
            selected={selected}
            mine={mineSet}
            disabled={!onSale || busy}
            onToggle={toggle}
          />
        </div>
      </Card>

      <aside className="grid content-start gap-4">
        {!onSale ? (
          <Card>
            <OnSaleLabel saleStartsAt={event.saleStartsAt} onOpen={() => setOnSale(true)} />
            <p className="mt-3 text-sm text-muted">Seats can be held once the sale opens. Keep this page open.</p>
          </Card>
        ) : null}

        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

        {mine.size > 0 ? (
          <Card>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Your seats</h2>
              <span className={`tabular-nums text-sm ${holdLeft < 60_000 ? "text-bad" : "text-muted"}`}>
                held for {formatCountdown(holdLeft)}
              </span>
            </div>
            <ul className="mt-3 grid gap-1 text-sm">
              {[...mine.keys()].map((id) => (
                <li key={id} className="flex justify-between">
                  <span>{describe(id)}</span>
                  <span className="text-muted">{formatMoney(priceOf(id), event.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-semibold">
              <span>Total</span>
              <span>{formatMoney(heldTotal, event.currency)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Prices in USD, plus applicable taxes.</p>
            <CheckoutForm eventId={event.id} user={user} onNoHolds={() => setMine(new Map())} />
            <Button variant="ghost" className="mt-2 w-full" onClick={release} busy={busy}>
              Release seats
            </Button>
          </Card>
        ) : null}

        {onSale && room > 0 ? (
          <Card>
            <h2 className="font-semibold">{mine.size > 0 ? "Add seats" : "Choose seats"}</h2>
            <p className="mt-1 text-sm text-muted">
              Tap seats on the map. You can hold up to {MAX_SEATS_PER_ORDER} for ten minutes.
            </p>
            {selected.size > 0 ? (
              <ul className="mt-3 grid gap-1 text-sm">
                {[...selected].map((id) => (
                  <li key={id} className="flex justify-between">
                    <span>{describe(id)}</span>
                    <span className="text-muted">{formatMoney(priceOf(id), event.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button className="mt-4 w-full" disabled={selected.size === 0} busy={busy} onClick={hold}>
              {selected.size === 0
                ? "Select seats"
                : `Hold ${selected.size} seat${selected.size > 1 ? "s" : ""} · ${formatMoney(selectedTotal, event.currency)}`}
            </Button>
            {!user ? (
              <p className="mt-2 text-center text-xs text-muted">
                You will be asked to{" "}
                <Link className="text-accent" href={`/login?next=${encodeURIComponent(pathname)}`}>
                  sign in
                </Link>{" "}
                first.
              </p>
            ) : null}
            <BestAvailable
              seats={initialSeats}
              stateOf={stateOf}
              max={room}
              disabled={busy}
              onPick={(ids) => {
                if (ids.length === 0) {
                  setMessage({ tone: "info", text: "No free seats left in that section." });
                  return;
                }
                setMessage(undefined);
                setSelected(new Set(ids));
              }}
            />
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
