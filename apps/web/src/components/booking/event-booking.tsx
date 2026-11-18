"use client";

import { MAX_SEATS_PER_ORDER, type SeatMapSeat } from "@gatepass/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth";
import { OnSaleLabel } from "@/components/on-sale-label";
import { SeatLegend, SeatMap } from "@/components/seat-map/seat-map";
import { useLiveSeats } from "@/components/seat-map/use-live-seats";
import { Button, Card, cx, Notice } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { formatCountdown, formatMoney } from "@/lib/format";
import type { PublicEvent, Section } from "@/lib/types";
import { BestAvailable } from "./best-available";
import { CheckoutForm } from "./checkout-form";

type Props = { event: PublicEvent; initialSeats: SeatMapSeat[]; sections?: Section[] };

const count = new Intl.NumberFormat("en-US");

export function EventBooking({ event, initialSeats, sections = [] }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { stateOf, status, applySnapshot, now, flashes } = useLiveSeats(event.id, initialSeats);

  const [onSale, setOnSale] = useState(() => Date.parse(event.saleStartsAt) <= Date.now());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mine, setMine] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState<{ tone: "error" | "ok" | "info"; text: string }>();
  const [busy, setBusy] = useState(false);
  const [focusSection, setFocusSection] = useState<string | null>(null);

  const seatsById = useMemo(() => new Map(initialSeats.map((s) => [s.id, s])), [initialSeats]);
  const describe = useCallback(
    (id: string) => {
      const s = seatsById.get(id);
      return s ? `${s.sectionName}, row ${s.rowLabel}, seat ${s.seatNumber}` : "a seat";
    },
    [seatsById],
  );

  // Live counts: seats not yet sold, overall and per section.
  const left = useMemo(() => {
    const bySection = new Map<string, number>();
    let total = 0;
    for (const s of initialSeats) {
      const state = stateOf(s.id);
      if (state === "sold" || state === "blocked") continue;
      total++;
      bySection.set(s.sectionId, (bySection.get(s.sectionId) ?? 0) + 1);
    }
    return { total, bySection };
  }, [initialSeats, stateOf]);

  // Restore holds after a reload.
  useEffect(() => {
    if (!user) return;
    api<{ holds: { seatId: string; heldUntil: string }[] }>(`/api/events/${event.id}/holds`)
      .then(({ holds }) => setMine(new Map(holds.map((h) => [h.seatId, h.heldUntil]))))
      .catch(() => {});
  }, [user, event.id]);

  const holdEndsAt = useMemo(() => Math.min(...[...mine.values()].map((t) => Date.parse(t))), [mine]);
  const holdLeft = mine.size > 0 ? holdEndsAt - now : 0;

  // The bar drains from the moment this hold (or its extension) began.
  const holdSpan = useRef(0);
  useEffect(() => {
    if (mine.size > 0) holdSpan.current = Math.max(holdEndsAt - Date.now(), 1);
  }, [holdEndsAt, mine.size]);
  const holdShare = holdSpan.current > 0 ? Math.min(1, Math.max(0, holdLeft / holdSpan.current)) : 1;

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
  const lastMinute = holdLeft < 60_000;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Seats" className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          {sections.length > 0 ? (
            <fieldset className="m-0 grid min-w-0 grid-cols-3 gap-2 border-0 p-0 sm:flex sm:flex-wrap sm:gap-3">
              <legend className="visually-hidden">Price tiers, pick one to light its section</legend>
              {sections.map((s) => {
                const on = focusSection === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFocusSection(on ? null : s.id)}
                    className={cx(
                      "tier grid min-h-11 min-w-0 cursor-pointer gap-1 px-3 py-2.5 sm:min-w-28 sm:px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      on ? "pass-1" : "bg-paper shadow-[inset_0_0_0_2px_var(--color-ink)] hover:bg-paper-2",
                    )}
                  >
                    <span className="label">{s.name}</span>
                    <span className="figure text-md sm:text-xl">{formatMoney(s.priceMinor, event.currency)}</span>
                    <span className="text-xs tabular-nums text-ink-2">
                      {count.format(left.bySection.get(s.id) ?? 0)} left
                    </span>
                  </button>
                );
              })}
            </fieldset>
          ) : null}
          <p className="text-right" aria-live="polite">
            <span className="figure block text-3xl">{count.format(left.total)}</span>
            <span className="label text-ink-2">of {count.format(initialSeats.length)} seats left</span>
          </p>
        </div>

        <div className="bar-top bg-paper-2 p-3 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SeatLegend />
            <span
              role="status"
              className={cx("label px-2 py-0.5", status === "live" ? "pass-1" : "bg-ink text-on-ink")}
            >
              {status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting"}
            </span>
          </div>
          <SeatMap
            seats={initialSeats}
            stateOf={stateOf}
            selected={selected}
            mine={mineSet}
            disabled={!onSale || busy}
            onToggle={toggle}
            focusSection={focusSection}
            flashes={flashes}
          />
        </div>
      </section>

      <aside className="grid content-start gap-5 lg:sticky lg:top-[calc(var(--nav-height)+var(--space-lg))] lg:self-start">
        {!onSale ? (
          <Card>
            <OnSaleLabel saleStartsAt={event.saleStartsAt} onOpen={() => setOnSale(true)} className="text-md" />
            <p className="mt-3 text-ink-2">Seats can be held once the sale opens. Keep this page open.</p>
          </Card>
        ) : null}

        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

        {mine.size > 0 ? (
          <Card className="p-0 sm:p-0">
            <div className={cx("px-5 pt-4 pb-3 sm:px-6", lastMinute ? "pass-2" : "pass-1")}>
              <div className="flex items-end justify-between gap-4">
                <h2 className="text-xl">Your seats</h2>
                <p className="text-right">
                  <span className="figure block text-3xl" role="timer" aria-label="Hold time left">
                    {formatCountdown(holdLeft)}
                  </span>
                  <span className="label">held for you</span>
                </p>
              </div>
            </div>
            <div className="hold-bar">
              <span className={lastMinute ? "bg-accent-2" : "bg-ink"} style={{ transform: `scaleX(${holdShare})` }} />
            </div>
            <div className="p-5 sm:p-6">
              <SeatTable ids={[...mine.keys()]} seatsById={seatsById} currency={event.currency} />
              <div className="mt-2 flex items-baseline justify-between border-t-4 border-ink pt-3">
                <span className="label text-md">Total</span>
                <span className="figure text-2xl">{formatMoney(heldTotal, event.currency)}</span>
              </div>
              <p className="mt-1 text-sm text-muted">Prices in USD, plus applicable taxes.</p>
              <CheckoutForm eventId={event.id} user={user} onNoHolds={() => setMine(new Map())} />
              <Button variant="ghost" className="mt-2 w-full" onClick={release} busy={busy}>
                Release seats
              </Button>
            </div>
          </Card>
        ) : null}

        {onSale && room > 0 ? (
          <Card>
            <h2 className="text-xl">{mine.size > 0 ? "Add seats" : "Choose seats"}</h2>
            <p className="mt-2 text-ink-2">
              Tap seats on the map. You can hold up to {MAX_SEATS_PER_ORDER} for ten minutes.
            </p>
            {selected.size > 0 ? (
              <div className="mt-4">
                <SeatTable
                  ids={[...selected]}
                  seatsById={seatsById}
                  currency={event.currency}
                  onRemove={toggle}
                  describe={describe}
                />
                <div className="flex items-baseline justify-between border-t-4 border-ink pt-3">
                  <span className="label text-md">{selected.size} selected</span>
                  <span className="figure text-xl">{formatMoney(selectedTotal, event.currency)}</span>
                </div>
              </div>
            ) : null}
            <Button className="mt-5 w-full" disabled={selected.size === 0} busy={busy} onClick={hold}>
              {selected.size === 0
                ? "Select seats"
                : `Hold ${selected.size} seat${selected.size > 1 ? "s" : ""}, ${formatMoney(selectedTotal, event.currency)}`}
            </Button>
            {!user ? (
              <p className="mt-3 text-center text-sm text-ink-2">
                You will be asked to{" "}
                <Link className="link" href={`/login?next=${encodeURIComponent(pathname)}`}>
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

/** Orders seats by section, then row (A before AA), then seat number. */
const bySeat = (seatsById: Map<string, SeatMapSeat>) => (a: string, b: string) => {
  const x = seatsById.get(a);
  const y = seatsById.get(b);
  if (!x || !y) return 0;
  return (
    x.sectionName.localeCompare(y.sectionName) ||
    x.rowLabel.length - y.rowLabel.length ||
    x.rowLabel.localeCompare(y.rowLabel) ||
    x.seatNumber - y.seatNumber
  );
};

/** Seats as a small table: section, row, seat and price side by side. */
function SeatTable({
  ids,
  seatsById,
  currency,
  onRemove,
  describe,
}: {
  ids: string[];
  seatsById: Map<string, SeatMapSeat>;
  currency: string;
  onRemove?: (id: string) => void;
  describe?: (id: string) => string;
}) {
  return (
    <table className="w-full text-left">
      <thead className="label border-b border-b-rule text-ink-2">
        <tr>
          <th className="py-2 pr-2 font-semibold">Section</th>
          <th className="px-2 py-2 font-semibold">Row</th>
          <th className="px-2 py-2 font-semibold">Seat</th>
          <th className="py-2 pl-2 text-right font-semibold">Price</th>
          {onRemove ? (
            <th className="w-0 py-2 pl-2">
              <span className="visually-hidden">Remove</span>
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-rule">
        {[...ids].sort(bySeat(seatsById)).map((id) => {
          const s = seatsById.get(id);
          if (!s) return null;
          return (
            <tr key={id}>
              <td className="py-2 pr-2">{s.sectionName}</td>
              <td className="px-2 py-2 tabular-nums">{s.rowLabel}</td>
              <td className="px-2 py-2 tabular-nums">{s.seatNumber}</td>
              <td className="py-2 pl-2 text-right tabular-nums">{formatMoney(s.priceMinor, currency)}</td>
              {onRemove ? (
                <td className="py-1 pl-2 text-right">
                  <button
                    type="button"
                    className="grid size-11 cursor-pointer place-items-center text-lg text-ink-2 hover:bg-paper-3 hover:text-ink"
                    onClick={() => onRemove(id)}
                    aria-label={`Remove ${describe?.(id) ?? "seat"}`}
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 16 16"
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 3l10 10M13 3L3 13" />
                    </svg>
                  </button>
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
