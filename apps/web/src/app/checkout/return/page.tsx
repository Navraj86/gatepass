"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RequireUser } from "@/components/require-user";
import { OrderView } from "@/components/tickets/order-view";
import { PageTitle } from "@/components/ui";

function ReturnContent() {
  const orderId = useSearchParams().get("order");
  if (!orderId) return <p className="text-muted">Missing order.</p>;
  return (
    <RequireUser>
      {() => (
        <>
          <PageTitle title="Your order" />
          <OrderView orderId={orderId} poll />
        </>
      )}
    </RequireUser>
  );
}

/** Dodo sends buyers here for every outcome; the page asks our API what really happened. */
export default function CheckoutReturnPage() {
  return (
    <Suspense>
      <ReturnContent />
    </Suspense>
  );
}
