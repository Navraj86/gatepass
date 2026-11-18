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
        <p className="text-muted">
          No tickets yet.{" "}
          <Link href="/" className="text-accent">
            Find an event
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {upcoming.map((t) => (
            <TicketCard key={t.id} ticket={t} eventTitle={`${t.eventTitle} · ${formatDateTime(t.startsAt)}`} />
          ))}
        </div>
      )}

      {orders.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 font-semibold">Orders</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{o.eventTitle}</span>
                    <span className="text-muted">
                      {" "}
                      · {o.seatCount} seat{o.seatCount === 1 ? "" : "s"} · {formatDateTime(o.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    {formatMoney(o.amountMinor, o.currency)}
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
