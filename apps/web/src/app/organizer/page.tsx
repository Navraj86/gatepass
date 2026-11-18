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
      {events?.length === 0 ? (
        <p className="bar-top pt-5 text-ink-2">No events yet. Create one to set up its seat map.</p>
      ) : null}
      {events && events.length > 0 ? (
        <ul className="bar-top">
          {events.map((e) => (
            <li key={e.id} className="border-b border-b-rule">
              <Link
                href={e.status === "draft" ? `/organizer/events/${e.id}` : `/organizer/events/${e.id}/sales`}
                className="row-link flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4"
              >
                <span className="min-w-0">
                  <span className="display block text-title">{e.title}</span>
                  <span className="label mt-1 block text-md text-ink-2">
                    {e.venue}, {formatDateTime(e.startsAt)}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="label tabular-nums text-md text-ink-2">
                    {(e.soldCount ?? 0).toLocaleString()} / {(e.seatCount ?? 0).toLocaleString()} sold
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
