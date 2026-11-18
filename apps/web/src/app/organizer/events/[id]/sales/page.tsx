"use client";

import { use, useCallback, useEffect, useState } from "react";
import { OrdersTable } from "@/components/organizer/orders-table";
import { StaffPanel } from "@/components/organizer/staff-panel";
import { RequireUser } from "@/components/require-user";
import { ButtonLink, Notice, PageTitle, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { EventStats, OrganizerEvent } from "@/lib/types";

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border-rule py-4 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0">
      <p className="label text-md text-ink-2">{label}</p>
      <p className="figure mt-2 text-2xl lg:text-3xl">{value}</p>
      {detail ? <p className="mt-1 text-sm text-ink-2">{detail}</p> : null}
    </div>
  );
}

function Sales({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<OrganizerEvent>();
  const [stats, setStats] = useState<EventStats>();
  const [error, setError] = useState<string>();

  const loadStats = useCallback(async () => {
    try {
      setStats((await api<{ stats: EventStats }>(`/api/organizer/events/${eventId}/stats`)).stats);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [eventId]);

  useEffect(() => {
    api<{ event: OrganizerEvent }>(`/api/organizer/events/${eventId}`)
      .then((r) => setEvent(r.event))
      .catch((err) => setError(errorMessage(err)));
  }, [eventId]);

  // Counters refresh every 5 seconds; the seat map itself is live over SSE on the public page.
  useEffect(() => {
    void loadStats();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadStats();
    }, 5000);
    return () => clearInterval(timer);
  }, [loadStats]);

  if (error && !event) return <Notice tone="error">{error}</Notice>;
  if (!event || !stats) return <Spinner />;

  const pct = (n: number, of: number) => {
    const value = of > 0 ? (n / of) * 100 : 0;
    return value > 0 && value < 1 ? "<1%" : `${Math.round(value)}%`;
  };
  return (
    <>
      <PageTitle
        title={event.title}
        subtitle={`${event.venue}, ${formatDateTime(event.startsAt)}`}
        action={
          <ButtonLink href={`/events/${event.id}`} variant="secondary">
            Live seat map
          </ButtonLink>
        }
      />
      <div className="bar-top grid grid-cols-1 divide-y divide-rule sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        <Stat
          label="Sold"
          value={`${stats.sold.toLocaleString()} / ${stats.totalSeats.toLocaleString()}`}
          detail={pct(stats.sold, stats.totalSeats)}
        />
        <Stat label="Held right now" value={stats.held.toLocaleString()} detail="in someone's cart" />
        <Stat
          label="Revenue"
          value={formatMoney(stats.revenueMinor, event.currency)}
          detail={`${stats.paidOrders} paid ${stats.paidOrders === 1 ? "order" : "orders"}${stats.refundingOrders ? `, ${stats.refundingOrders} refunding` : ""}`}
        />
        <Stat
          label="Checked in"
          value={`${stats.checkedIn.toLocaleString()} / ${stats.validTickets.toLocaleString()}`}
          detail={pct(stats.checkedIn, stats.validTickets)}
        />
      </div>
      <div className="mt-12 grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <OrdersTable eventId={eventId} onRefund={loadStats} />
        <StaffPanel eventId={eventId} />
      </div>
    </>
  );
}

export default function SalesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequireUser roles={["organizer"]}>{() => <Sales eventId={id} />}</RequireUser>;
}
