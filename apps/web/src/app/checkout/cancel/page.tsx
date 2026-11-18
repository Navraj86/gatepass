"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { RequireUser } from "@/components/require-user";
import { ButtonLink, Spinner } from "@/components/ui";
import { api } from "@/lib/api";

function Cancel({ orderId }: { orderId: string }) {
  const [eventId, setEventId] = useState<string>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { order } = await api<{ order: { eventId: string } }>(`/api/orders/${orderId}`);
        setEventId(order.eventId);
        // Releases the seats right away instead of waiting for the hold to lapse.
        await api(`/api/orders/${orderId}/cancel`, { method: "POST", body: {} });
      } catch {
        // Already paid, cancelled or expired: nothing to release.
      } finally {
        setDone(true);
      }
    })();
  }, [orderId]);

  if (!done) return <Spinner label="Releasing your seats" />;
  return (
    <div className="bar-top grid gap-x-8 gap-y-6 pt-8 lg:grid-cols-12">
      <h1 className="text-display-s lg:col-span-7">Checkout cancelled</h1>
      <div className="grid content-start justify-items-start gap-6 lg:col-span-5">
        <p className="lead text-ink-2">Your seats were released for other buyers. Nothing was charged.</p>
        <ButtonLink href={eventId ? `/events/${eventId}` : "/"}>Back to the seat map</ButtonLink>
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
