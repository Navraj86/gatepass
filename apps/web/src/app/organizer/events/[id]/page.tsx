"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { EventForm } from "@/components/organizer/event-form";
import { SectionsEditor } from "@/components/organizer/sections-editor";
import { RequireUser } from "@/components/require-user";
import { Badge, Button, ButtonLink, Card, Notice, PageTitle, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { OrganizerEvent, OrganizerSection } from "@/lib/types";

type Detail = { event: OrganizerEvent; sections: OrganizerSection[] };

function EditEvent({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Detail>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/organizer/events/${eventId}`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const { event, sections } = data;

  if (event.status !== "draft") {
    return (
      <>
        <PageTitle title={event.title} subtitle={`${event.venue}, ${formatDateTime(event.startsAt)}`} />
        <Card className="grid max-w-xl gap-3">
          <p>
            This event is <Badge status={event.status} />. Published events cannot be edited, so buyers always see the
            seats and prices they paid for.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={`/organizer/events/${event.id}/sales`}>Sales and staff</ButtonLink>
            <ButtonLink href={`/events/${event.id}`} variant="secondary">
              Public page
            </ButtonLink>
          </div>
        </Card>
      </>
    );
  }

  async function publish() {
    setError(undefined);
    setPublishing(true);
    try {
      await api(`/api/organizer/events/${eventId}/publish`, { method: "POST", body: {} });
      router.push(`/organizer/events/${eventId}/sales`);
    } catch (err) {
      setError(errorMessage(err));
      setPublishing(false);
    }
  }

  return (
    <>
      <PageTitle
        title={event.title}
        subtitle={
          <>
            <Badge status="draft" /> Sales open {formatDateTime(event.saleStartsAt)} once published.
          </>
        }
        action={
          <Button onClick={publish} busy={publishing} disabled={sections.length === 0}>
            Publish
          </Button>
        }
      />
      {error ? (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-2">
        <Card>
          <h2 className="mb-5 text-2xl">Details</h2>
          <EventForm
            event={event}
            submitLabel={saved ? "Saved" : "Save changes"}
            onSubmit={async (values) => {
              await api(`/api/organizer/events/${eventId}`, { method: "PATCH", body: values });
              await load();
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          />
        </Card>
        <SectionsEditor eventId={eventId} currency={event.currency} sections={sections} onChange={load} />
      </div>
      <p className="mt-8">
        <Link href="/organizer" className="link">
          Back to your events
        </Link>
      </p>
    </>
  );
}

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequireUser roles={["organizer"]}>{() => <EditEvent eventId={id} />}</RequireUser>;
}
