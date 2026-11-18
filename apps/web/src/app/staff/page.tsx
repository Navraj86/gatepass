"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireUser } from "@/components/require-user";
import { Notice, PageTitle, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { StaffEvent } from "@/lib/types";

function Events() {
  const [events, setEvents] = useState<StaffEvent[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<{ events: StaffEvent[] }>("/api/staff/events")
      .then((r) => setEvents(r.events))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!events) return <Spinner />;
  return (
    <>
      <PageTitle title="Door scanning" subtitle="Pick the event you are working." />
      {events.length === 0 ? (
        <p className="bar-top pt-5 text-ink-2">
          No events assigned to you yet. Ask the organizer to add you as door staff.
        </p>
      ) : (
        <ul className="bar-top">
          {events.map((e) => (
            <li key={e.id} className="border-b border-b-rule">
              <Link
                href={`/staff/scan/${e.id}`}
                className="row-link grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 py-5"
              >
                <span className="min-w-0">
                  <span className="display block text-title">{e.title}</span>
                  <span className="label mt-1 block text-md text-ink-2">
                    {e.venue}, {formatDateTime(e.startsAt)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="figure block text-2xl">{e.checkedIn}</span>
                  <span className="label text-ink-2">of {e.validTickets} checked in</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function StaffPage() {
  return <RequireUser roles={["staff", "organizer"]}>{() => <Events />}</RequireUser>;
}
