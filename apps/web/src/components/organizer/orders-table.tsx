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
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <h2 className="text-lg font-semibold">Orders</h2>
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
        <div className="px-5 pb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-y border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-2 font-medium">Buyer</th>
              <th className="px-3 py-2 font-medium">Seats</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Placed</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.orders.map((o) => (
              <tr key={o.id}>
                <td className="px-5 py-2.5">
                  <span className="font-medium">{o.buyerName}</span>
                  <span className="block text-xs text-muted">{o.buyerEmail}</span>
                </td>
                <td className="px-3 py-2.5">
                  {o.seatCount}
                  {o.scannedCount > 0 ? <span className="text-xs text-muted"> ({o.scannedCount} in)</span> : null}
                </td>
                <td className="px-3 py-2.5">{formatMoney(o.amountMinor, o.currency)}</td>
                <td className="px-3 py-2.5">
                  <Badge status={o.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDateTime(o.createdAt)}</td>
                <td className="px-5 py-2.5 text-right">
                  {o.status === "paid" && o.scannedCount === 0 ? (
                    <Button variant="danger" className="h-8 px-3" busy={refunding === o.id} onClick={() => refund(o)}>
                      Refund
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.orders.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No orders yet.</p> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm text-muted">
        <span>{data ? `${data.total} orders` : ""}</span>
        <span className="flex items-center gap-2">
          <Button variant="ghost" className="h-8 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          {page} / {pages}
          <Button variant="ghost" className="h-8 px-2" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </span>
      </div>
    </div>
  );
}
