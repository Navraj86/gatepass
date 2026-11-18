import Link from "next/link";
import { OnSaleLabel } from "@/components/on-sale-label";
import { formatDateTime, formatMoney } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { PublicEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await serverApi<{ events: PublicEvent[] }>("/api/events");
  const events = data?.events ?? [];

  return (
    <div>
      <section className="mb-10 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pick your seat before anyone else does.</h1>
        <p className="mt-3 text-muted">
          Watch seats change live, hold up to six for ten minutes, and pay with a QR ticket in your inbox. Every seat is
          sold once.
        </p>
      </section>

      {events.length === 0 ? (
        <p className="text-muted">No events on sale right now.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="group block h-full rounded-2xl border border-line bg-surface p-5 transition hover:border-accent"
              >
                <OnSaleLabel saleStartsAt={event.saleStartsAt} />
                <h2 className="mt-3 text-lg font-semibold tracking-tight group-hover:text-accent">{event.title}</h2>
                <p className="mt-1 text-sm text-muted">{event.venue}</p>
                <p className="mt-1 text-sm text-muted">{formatDateTime(event.startsAt)}</p>
                {event.fromPriceMinor != null ? (
                  <p className="mt-4 text-sm">
                    From <span className="font-semibold">{formatMoney(event.fromPriceMinor, event.currency)}</span>
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
