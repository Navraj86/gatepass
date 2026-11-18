import type { SeatMapSeat } from "@gatepass/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventBooking } from "@/components/booking/event-booking";
import { formatMoney, formatMonthDay, formatTime, formatWeekday } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { PublicEvent, Section } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [detail, seatMap] = await Promise.all([
    serverApi<{ event: PublicEvent; sections: Section[] }>(`/api/events/${id}`),
    serverApi<{ seats: SeatMapSeat[] }>(`/api/events/${id}/seats`),
  ]);
  return detail && seatMap ? { ...detail, seats: seatMap.seats } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id);
  return { title: data?.event.title ?? "Event" };
}

export default async function EventPage({ params }: Params) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { event, sections, seats } = data;
  const fromPrice = sections.length > 0 ? Math.min(...sections.map((s) => s.priceMinor)) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <section
        aria-labelledby="event-title"
        className="grid grid-cols-[minmax(0,1fr)] items-end gap-x-8 gap-y-8 lg:grid-cols-12"
      >
        <div className="min-w-0 lg:col-span-7">
          <p className="label text-md text-ink-2">{event.venue}</p>
          <h1 id="event-title" className="mt-3 text-display-s">
            {event.title}
          </h1>
          {event.description ? <p className="lead mt-4 text-ink-2">{event.description}</p> : null}
        </div>

        <dl className="grid grid-cols-3 border-y-4 border-ink lg:col-span-5">
          <div className="py-4 pr-4">
            <dt className="label text-ink-2">Date</dt>
            <dd className="figure mt-1 text-md sm:text-xl">
              <time dateTime={event.startsAt}>
                {formatWeekday(event.startsAt)}, {formatMonthDay(event.startsAt)}
              </time>
            </dd>
          </div>
          <div className="border-l border-rule px-4 py-4">
            <dt className="label text-ink-2">Starts</dt>
            <dd className="figure mt-1 text-md sm:text-xl">{formatTime(event.startsAt)}</dd>
          </div>
          <div className="border-l border-rule py-4 pl-4">
            <dt className="label text-ink-2">From</dt>
            <dd className="figure mt-1 text-md sm:text-xl">
              {fromPrice != null ? formatMoney(fromPrice, event.currency) : null}
            </dd>
          </div>
        </dl>
      </section>

      {event.status === "cancelled" ? (
        <p className="bar-top pt-5 text-lead font-semibold text-error">This event was cancelled.</p>
      ) : (
        <EventBooking event={event} initialSeats={seats} sections={sections} />
      )}
    </div>
  );
}
