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
        <p className="text-muted">No events assigned to you yet. Ask the organizer to add you as door staff.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/staff/scan/${e.id}`}
                className="block rounded-2xl border border-line bg-surface p-4 transition hover:border-accent"
              >
                <span className="font-semibold">{e.title}</span>
                <span className="block text-sm text-muted">
                  {e.venue} · {formatDateTime(e.startsAt)}
                </span>
                <span className="mt-2 block text-sm">
                  {e.checkedIn} of {e.validTickets} checked in
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
