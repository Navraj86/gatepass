"use client";

import { createEventSchema } from "@gatepass/shared";
import { useState } from "react";
import { Button, Field, Input, Notice, Textarea } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { toLocalInput } from "@/lib/format";
import { type FieldErrors, fieldErrors } from "@/lib/forms";
import type { OrganizerEvent } from "@/lib/types";

export type EventFormValues = {
  title: string;
  description?: string;
  venue: string;
  startsAt: Date;
  saleStartsAt: Date;
};

/** Create and edit share this form; times are entered in the browser's time zone. */
export function EventForm({
  event,
  submitLabel,
  onSubmit,
}: {
  event?: OrganizerEvent;
  submitLabel: string;
  onSubmit: (values: EventFormValues) => Promise<void>;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const local = (name: string) => {
      const value = String(form.get(name) ?? "");
      return value ? new Date(value) : undefined;
    };
    const parsed = createEventSchema.safeParse({
      title: form.get("title"),
      description: String(form.get("description") ?? "").trim() || undefined,
      venue: form.get("venue"),
      startsAt: local("startsAt"),
      saleStartsAt: local("saleStartsAt"),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setError(undefined);
    setBusy(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handle} noValidate>
      <Field label="Title" error={errors.title}>
        <Input name="title" defaultValue={event?.title} placeholder="Friday Night Live" />
      </Field>
      <Field label="Venue" error={errors.venue}>
        <Input name="venue" defaultValue={event?.venue} placeholder="Riverside Arena" />
      </Field>
      <Field label="Description" error={errors.description} hint="Optional, shown on the event page.">
        <Textarea name="description" defaultValue={event?.description ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event starts" error={errors.startsAt}>
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={event ? toLocalInput(event.startsAt) : undefined}
          />
        </Field>
        <Field label="Sales open" error={errors.saleStartsAt}>
          <Input
            name="saleStartsAt"
            type="datetime-local"
            defaultValue={event ? toLocalInput(event.saleStartsAt) : undefined}
          />
        </Field>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div>
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
