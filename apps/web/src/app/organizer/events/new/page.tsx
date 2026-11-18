"use client";

import { useRouter } from "next/navigation";
import { EventForm } from "@/components/organizer/event-form";
import { RequireUser } from "@/components/require-user";
import { Card, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import type { OrganizerEvent } from "@/lib/types";

function NewEvent() {
  const router = useRouter();
  return (
    <>
      <PageTitle title="New event" subtitle="Start with the basics. You add sections and seats next." />
      <Card className="max-w-2xl">
        <EventForm
          submitLabel="Create draft"
          onSubmit={async (values) => {
            const { event } = await api<{ event: OrganizerEvent }>("/api/organizer/events", {
              method: "POST",
              body: values,
            });
            router.push(`/organizer/events/${event.id}`);
          }}
        />
      </Card>
    </>
  );
}

export default function NewEventPage() {
  return <RequireUser roles={["organizer"]}>{() => <NewEvent />}</RequireUser>;
}
