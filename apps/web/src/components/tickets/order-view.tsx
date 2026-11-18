"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Card, Notice, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Order, Ticket } from "@/lib/types";
import { TicketCard } from "./ticket-card";

type Data = { order: Order; tickets: Ticket[] };

const SETTLED = new Set(["paid", "refunding", "refunded", "failed", "cancelled", "expired"]);

/**
 * Shows an order. With `poll`, it asks the API every 1.5 s until the webhook
 * has settled the order: the return URL's own status is never trusted.
 */
export function OrderView({ orderId, poll = false }: { orderId: string; poll?: boolean }) {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();
  const [resend, setResend] = useState<"idle" | "busy" | "sent">("idle");

  const load = useCallback(async () => {
    try {
      const next = await api<Data>(`/api/orders/${orderId}`);
      setData(next);
      return next;
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    }
  }, [orderId]);

  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    async function tick() {
      const next = await load();
      attempts++;
      const settled = next && SETTLED.has(next.order.status);
      // A pending order past its checkout window will not settle; stop after ~2 minutes.
      if (!stopped && poll && !settled && attempts < 80) setTimeout(tick, 1500);
    }
    void tick();
    return () => {
      stopped = true;
    };
  }, [load, poll]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Spinner label="Loading your order" />;

  const { order, tickets } = data;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl">{order.eventTitle}</h2>
            <p className="label mt-2 text-md text-ink-2">
              {order.venue}, {formatDateTime(order.startsAt)}
            </p>
          </div>
          <Badge status={order.status} />
        </div>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="figure text-3xl">{formatMoney(order.amountMinor, order.currency)}</span>
          {order.chargedAmountMinor && order.chargedCurrency && order.chargedCurrency !== order.currency ? (
            <span className="text-ink-2">
              (charged {formatMoney(order.chargedAmountMinor, order.chargedCurrency)} including taxes)
            </span>
          ) : null}
        </p>
        <StatusMessage status={order.status} failureCode={order.failureCode} eventId={order.eventId} />
      </Card>

      {tickets.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} eventTitle={order.eventTitle} when={formatDateTime(order.startsAt)} />
          ))}
        </div>
      ) : null}

      {order.status === "paid" ? (
        <div>
          <Button
            variant="secondary"
            busy={resend === "busy"}
            disabled={resend === "sent"}
            onClick={async () => {
              setResend("busy");
              try {
                await api(`/api/orders/${order.id}/resend-email`, { method: "POST", body: {} });
                setResend("sent");
              } catch (err) {
                setError(errorMessage(err));
                setResend("idle");
              }
            }}
          >
            {resend === "sent" ? "Email sent" : "Email my tickets again"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StatusMessage({
  status,
  failureCode,
  eventId,
}: {
  status: Order["status"];
  failureCode: string | null;
  eventId: string;
}) {
  switch (status) {
    case "pending":
      return (
        <div className="mt-4">
          <Notice>Waiting for the payment to be confirmed. This usually takes a few seconds.</Notice>
        </div>
      );
    case "paid":
      return (
        <div className="mt-4">
          <Notice tone="ok">Payment confirmed. Your tickets are below and on their way to your inbox.</Notice>
        </div>
      );
    case "refunding":
    case "refunded":
      return (
        <div className="mt-4">
          <Notice>
            {status === "refunding" ? "A full refund is on its way." : "This order was refunded."} If the payment
            arrived after your hold ran out and the seats were sold, the refund is automatic.
          </Notice>
        </div>
      );
    case "failed":
      return (
        <div className="mt-4 grid gap-3">
          <Notice tone="error">
            The payment did not go through{failureCode ? ` (${failureCode.replaceAll("_", " ").toLowerCase()})` : ""}.
            Your seats stay held until the timer runs out, so you can try again.
          </Notice>
          <ButtonLink href={`/events/${eventId}`} variant="secondary">
            Back to your seats
          </ButtonLink>
        </div>
      );
    default:
      return (
        <div className="mt-4 grid gap-3">
          <Notice>This checkout was not completed.</Notice>
          <ButtonLink href={`/events/${eventId}`} variant="secondary">
            Choose seats again
          </ButtonLink>
        </div>
      );
  }
}
