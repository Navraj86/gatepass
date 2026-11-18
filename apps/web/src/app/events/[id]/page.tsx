import type { SeatMapSeat } from "@gatepass/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventBooking } from "@/components/booking/event-booking";
import { formatDateTime, formatMoney } from "@/lib/format";
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
  const sold = seats.filter((s) => s.state === "sold").length;

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted">{formatDateTime(event.startsAt)}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{event.title}</h1>
        <p className="mt-1 text-muted">{event.venue}</p>
        {event.description ? <p className="mt-3 max-w-2xl">{event.description}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {sections.map((s) => (
            <span key={s.id} className="rounded-full border border-line bg-surface px-3 py-1">
              {s.name} <span className="text-muted">{formatMoney(s.priceMinor, event.currency)}</span>
            </span>
          ))}
          <span className="rounded-full px-3 py-1 text-muted">
            {seats.length - sold} of {seats.length} seats left
          </span>
        </div>
      </div>
      {event.status === "cancelled" ? (
        <p className="text-bad">This event was cancelled.</p>
      ) : (
        <EventBooking event={event} initialSeats={seats} />
      )}
    </div>
  );
}
