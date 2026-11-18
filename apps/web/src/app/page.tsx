import Link from "next/link";
import { OnSaleLabel } from "@/components/on-sale-label";
import { cx } from "@/components/ui";
import { formatDay, formatMoney, formatTime } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { PublicEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await serverApi<{ events: PublicEvent[] }>("/api/events");
  const events = data?.events ?? [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 sm:gap-14">
      <section aria-labelledby="pick" className="grid items-end gap-x-8 gap-y-4 lg:grid-cols-12">
        <h1 id="pick" className="text-display-s lg:col-span-8">
          Pick your seat before anyone else does.
        </h1>
        <p className="lead text-ink-2 lg:col-span-4 lg:pb-2">
          Live seat maps, ten-minute holds, and every seat sold once.
        </p>
      </section>

      <section aria-labelledby="on-sale">
        <h2 id="on-sale" className="visually-hidden">
          Events
        </h2>
        {events.length === 0 ? (
          <p className="bar-top pt-6 text-lead text-muted">No events on sale right now.</p>
        ) : (
          <ol className="bar-top">
            {events.map((event, i) => (
              <li key={event.id} className="border-b border-b-rule">
                <Link
                  href={`/events/${event.id}`}
                  className={cx(
                    "row-link grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 py-5 md:grid-cols-12 md:gap-x-8",
                    i === 0 && "md:py-8",
                  )}
                >
                  <span className="label col-span-2 text-ink-2 md:col-span-2 md:text-md">
                    <time dateTime={event.startsAt}>
                      {formatDay(event.startsAt)}
                      <br className="hidden md:block" />
                      <span className="md:hidden">, </span>
                      {formatTime(event.startsAt)}
                    </time>
                  </span>
                  <div className="col-span-2 min-w-0 md:col-span-6">
                    <h3 className={cx("max-w-none", i === 0 ? "text-section" : "text-title")}>{event.title}</h3>
                    <span className="mt-1 block text-ink-2">{event.venue}</span>
                  </div>
                  <span className="md:col-span-2 md:text-right">
                    {event.fromPriceMinor != null ? (
                      <>
                        <span className="label block text-ink-2">From</span>
                        <span className="figure block text-xl md:text-2xl">
                          {formatMoney(event.fromPriceMinor, event.currency)}
                        </span>
                      </>
                    ) : null}
                  </span>
                  <span className="justify-self-end md:col-span-2">
                    <OnSaleLabel saleStartsAt={event.saleStartsAt} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
