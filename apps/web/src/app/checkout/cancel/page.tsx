"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { RequireUser } from "@/components/require-user";
import { ButtonLink, Card, Spinner } from "@/components/ui";
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
    <Card className="mx-auto max-w-md text-center">
      <h1 className="text-xl font-semibold">Checkout cancelled</h1>
      <p className="mt-2 text-sm text-muted">Your seats were released for other buyers. Nothing was charged.</p>
      <ButtonLink className="mt-5" href={eventId ? `/events/${eventId}` : "/"}>
        Back to the seat map
      </ButtonLink>
    </Card>
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
