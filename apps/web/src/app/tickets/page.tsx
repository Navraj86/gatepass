"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireUser } from "@/components/require-user";
import { TicketCard } from "@/components/tickets/ticket-card";
import { Badge, Notice, PageTitle, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { OrderStatus, Ticket } from "@/lib/types";

type MyTicket = Ticket & { orderId: string; eventId: string; eventTitle: string; startsAt: string };
type MyOrder = {
  id: string;
  status: OrderStatus;
  amountMinor: number;
  currency: string;
  eventTitle: string;
  createdAt: string;
  seatCount: number;
};

function Tickets() {
  const [tickets, setTickets] = useState<MyTicket[]>();
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([api<{ tickets: MyTicket[] }>("/api/me/tickets"), api<{ orders: MyOrder[] }>("/api/me/orders")])
      .then(([t, o]) => {
        setTickets(t.tickets);
        setOrders(o.orders);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!tickets) return <Spinner />;

  const upcoming = tickets.filter((t) => t.status === "valid");
  return (
    <>
      <PageTitle title="My tickets" subtitle="Show the QR code at the door. Each code works once." />
      {upcoming.length === 0 ? (
        <p className="bar-top pt-5 text-ink-2">
          No tickets yet.{" "}
          <Link href="/" className="link">
            Find an event
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {upcoming.map((t) => (
            <TicketCard key={t.id} ticket={t} eventTitle={t.eventTitle} when={formatDateTime(t.startsAt)} />
          ))}
        </div>
      )}

      {orders.length > 0 ? (
        <section className="mt-16">
          <h2 className="mb-4 text-2xl">Orders</h2>
          <ul className="bar-top">
            {orders.map((o) => (
              <li key={o.id} className="border-b border-b-rule">
                <Link
                  href={`/orders/${o.id}`}
                  className="row-link grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{o.eventTitle}</span>
                    <span className="label block text-ink-2">
                      {o.seatCount} seat{o.seatCount === 1 ? "" : "s"}, ordered {formatDateTime(o.createdAt)}
                    </span>
                  </span>
                  <span className="figure text-lg sm:text-xl">{formatMoney(o.amountMinor, o.currency)}</span>
                  <span className="col-start-2 justify-self-end sm:col-start-auto">
                    <Badge status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export default function TicketsPage() {
  return <RequireUser>{() => <Tickets />}</RequireUser>;
}
