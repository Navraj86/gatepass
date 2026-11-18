"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireUser } from "@/components/require-user";
import { Badge, ButtonLink, Notice, PageTitle, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { OrganizerEvent } from "@/lib/types";

function Events() {
  const [events, setEvents] = useState<OrganizerEvent[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<{ events: OrganizerEvent[] }>("/api/organizer/events")
      .then((r) => setEvents(r.events))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  return (
    <>
      <PageTitle
        title="Your events"
        subtitle="Drafts stay private until you publish them."
        action={<ButtonLink href="/organizer/events/new">New event</ButtonLink>}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!events && !error ? <Spinner /> : null}
      {events?.length === 0 ? <p className="text-muted">No events yet. Create one to set up its seat map.</p> : null}
      {events && events.length > 0 ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={e.status === "draft" ? `/organizer/events/${e.id}` : `/organizer/events/${e.id}/sales`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span>
                  <span className="font-medium">{e.title}</span>
                  <span className="block text-sm text-muted">
                    {e.venue} · {formatDateTime(e.startsAt)}
                  </span>
                </span>
                <span className="flex items-center gap-4 text-sm">
                  <span className="text-muted">
                    {e.soldCount ?? 0} / {e.seatCount ?? 0} sold
                  </span>
                  <Badge status={e.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export default function OrganizerPage() {
  return <RequireUser roles={["organizer"]}>{() => <Events />}</RequireUser>;
}
