"use client";

import { use } from "react";
import { RequireUser } from "@/components/require-user";
import { OrderView } from "@/components/tickets/order-view";
import { PageTitle } from "@/components/ui";

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequireUser>
      {() => (
        <>
          <PageTitle title="Order" />
          <OrderView orderId={id} />
        </>
      )}
    </RequireUser>
  );
}
