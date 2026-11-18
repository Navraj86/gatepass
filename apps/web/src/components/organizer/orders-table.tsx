"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Notice, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { OrderStatus, OrganizerOrder } from "@/lib/types";

type Page = { orders: OrganizerOrder[]; page: number; pageSize: number; total: number };

const FILTERS: { value: "" | OrderStatus; label: string }[] = [
  { value: "", label: "All orders" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "refunding", label: "Refunding" },
  { value: "refunded", label: "Refunded" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

export function OrdersTable({ eventId, onRefund }: { eventId: string; onRefund: () => void }) {
  const [status, setStatus] = useState<"" | OrderStatus>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page>();
  const [error, setError] = useState<string>();
  const [refunding, setRefunding] = useState<string>();

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), ...(status ? { status } : {}) });
    try {
      setData(await api<Page>(`/api/organizer/events/${eventId}/orders?${query}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [eventId, page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refund(order: OrganizerOrder) {
    const amount = formatMoney(order.amountMinor, order.currency);
    if (!window.confirm(`Refund ${amount} to ${order.buyerEmail}? Their tickets stop working right away.`)) return;
    setError(undefined);
    setRefunding(order.id);
    try {
      await api(`/api/organizer/orders/${order.id}/refund`, { method: "POST", body: {} });
      await load();
      onRefund();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefunding(undefined);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
        <h2 className="text-2xl">Orders</h2>
        <Select
          aria-label="Filter orders"
          className="w-40"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "" | OrderStatus);
            setPage(1);
          }}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <div className="pb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="bar-top overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="label border-b border-b-rule text-ink-2">
            <tr>
              <th className="whitespace-nowrap py-3 pr-3 font-semibold">Buyer</th>
              <th className="whitespace-nowrap px-3 py-3 font-semibold">Seats</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Amount</th>
              <th className="whitespace-nowrap px-3 py-3 font-semibold">Status</th>
              <th className="whitespace-nowrap px-3 py-3 font-semibold">Placed</th>
              <th className="py-3 pl-3">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {data?.orders.map((o) => (
              <tr key={o.id}>
                <td className="py-3 pr-3">
                  <span className="font-semibold">{o.buyerName}</span>
                  <span className="block text-ink-2">{o.buyerEmail}</span>
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {o.seatCount}
                  {o.scannedCount > 0 ? <span className="text-ink-2"> ({o.scannedCount} in)</span> : null}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMoney(o.amountMinor, o.currency)}</td>
                <td className="px-3 py-3">
                  <Badge status={o.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-2">{formatDateTime(o.createdAt)}</td>
                <td className="py-3 pl-3 text-right">
                  {o.status === "paid" && o.scannedCount === 0 ? (
                    <Button variant="danger" small busy={refunding === o.id} onClick={() => refund(o)}>
                      Refund
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.orders.length === 0 ? <p className="py-6 text-ink-2">No orders yet.</p> : null}
      </div>
      <div className="label flex items-center justify-between gap-3 border-t border-t-rule py-2 text-md text-ink-2">
        <span className="tabular-nums">{data ? `${data.total} orders` : ""}</span>
        <span className="flex items-center gap-1 tabular-nums">
          <Button variant="ghost" small disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          {page} of {pages}
          <Button variant="ghost" small disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </span>
      </div>
    </section>
  );
}
