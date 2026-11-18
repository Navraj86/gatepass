"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { RequireUser } from "@/components/require-user";
import { ButtonLink, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { OrderStatus } from "@/lib/types";

function Cancel({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<{ eventId: string; status: OrderStatus }>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { order } = await api<{ order: { eventId: string; status: OrderStatus } }>(`/api/orders/${orderId}`);
        setOrder(order);
        // Releases the seats right away instead of waiting for the hold to lapse. Only a pending order
        // still holds seats; a paid, cancelled or expired one has nothing to release.
        if (order.status === "pending") {
          await api(`/api/orders/${orderId}/cancel`, { method: "POST", body: {} });
        }
      } catch {
        // The order is gone or the cancel lost a race with the payment webhook; the copy below still holds.
      } finally {
        setDone(true);
      }
    })();
  }, [orderId]);

  if (!done) return <Spinner label="Releasing your seats" />;
  if (order?.status === "paid") {
    return (
      <div className="bar-top grid gap-x-8 gap-y-6 pt-8 lg:grid-cols-12">
        <h1 className="text-display-s lg:col-span-7">This order is paid</h1>
        <div className="grid content-start justify-items-start gap-6 lg:col-span-5">
          <p className="lead text-ink-2">
            The payment went through before the checkout closed. Your tickets are ready.
          </p>
          <ButtonLink href={`/orders/${orderId}`}>See your tickets</ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <div className="bar-top grid gap-x-8 gap-y-6 pt-8 lg:grid-cols-12">
      <h1 className="text-display-s lg:col-span-7">Checkout cancelled</h1>
      <div className="grid content-start justify-items-start gap-6 lg:col-span-5">
        <p className="lead text-ink-2">Your seats were released for other buyers. Nothing was charged.</p>
        <ButtonLink href={order ? `/events/${order.eventId}` : "/"}>Back to the seat map</ButtonLink>
      </div>
    </div>
  );
}

function CancelContent() {
  const orderId = useSearchParams().get("order");
  if (!orderId) return <p className="text-muted">Missing order.</p>;
  return <RequireUser>{() => <Cancel orderId={orderId} />}</RequireUser>;
}

export default function CheckoutCancelPage() {
  return (
    <Suspense>
      <CancelContent />
    </Suspense>
  );
}
