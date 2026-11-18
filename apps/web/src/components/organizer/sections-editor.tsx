"use client";

import { createSectionSchema, MAX_SEATS_PER_EVENT } from "@gatepass/shared";
import { useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { type FieldErrors, fieldErrors } from "@/lib/forms";
import type { OrganizerSection } from "@/lib/types";

/**
 * Sections are generated as a grid: rows x seats per row at one price.
 * Row letters continue across sections, so the first section starts at row A.
 */
export function SectionsEditor({
  eventId,
  currency,
  sections,
  onChange,
}: {
  eventId: string;
  currency: string;
  sections: OrganizerSection[];
  onChange: () => Promise<void>;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState({ rows: 10, seatsPerRow: 20 });

  const totalSeats = sections.reduce((sum, s) => sum + s.seatCount, 0);
  const adding = preview.rows * preview.seatsPerRow || 0;

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const price = Number(form.get("price"));
    const parsed = createSectionSchema.safeParse({
      name: form.get("name"),
      priceMinor: Number.isFinite(price) ? Math.round(price * 100) : Number.NaN,
      rows: Number(form.get("rows")),
      seatsPerRow: Number(form.get("seatsPerRow")),
    });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors({ ...next, price: next.priceMinor ?? "" });
      return;
    }
    setErrors({});
    setError(undefined);
    setBusy(true);
    try {
      await api(`/api/organizer/events/${eventId}/sections`, { method: "POST", body: parsed.data });
      formEl.reset();
      setPreview({ rows: 10, seatsPerRow: 20 });
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(sectionId: string) {
    setError(undefined);
    try {
      await api(`/api/organizer/events/${eventId}/sections/${sectionId}`, { method: "DELETE" });
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-2xl">Sections</h2>
        <span className="label tabular-nums text-md text-ink-2">
          {totalSeats.toLocaleString()} / {MAX_SEATS_PER_EVENT.toLocaleString()} seats
        </span>
      </div>

      {sections.length === 0 ? (
        <p className="mt-3 text-ink-2">No sections yet. Add the one closest to the stage first.</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y-4 border-y-ink">
          {sections.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block font-semibold">{s.name}</span>
                <span className="label block tabular-nums text-ink-2">
                  Rows {s.firstRow} to {s.lastRow}, {s.seatCount} seats, {formatMoney(s.priceMinor, currency)}
                </span>
              </span>
              <Button variant="danger" small onClick={() => remove(s.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form className="mt-6 grid gap-2" onSubmit={add} noValidate>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="Section name" error={errors.name}>
            <Input name="name" placeholder="Front" />
          </Field>
          <Field label={`Price (${currency})`} error={errors.price}>
            <Input name="price" type="number" min="0.5" step="0.01" placeholder="45.00" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rows" error={errors.rows}>
            <Input
              name="rows"
              type="number"
              min={1}
              max={60}
              value={preview.rows || ""}
              onChange={(e) => setPreview((p) => ({ ...p, rows: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Seats per row" error={errors.seatsPerRow}>
            <Input
              name="seatsPerRow"
              type="number"
              min={1}
              max={100}
              value={preview.seatsPerRow || ""}
              onChange={(e) => setPreview((p) => ({ ...p, seatsPerRow: Number(e.target.value) }))}
            />
          </Field>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" busy={busy}>
            Add section
          </Button>
          <span className="label tabular-nums text-md text-ink-2">Adds {adding.toLocaleString()} seats</span>
        </div>
      </form>
    </Card>
  );
}
