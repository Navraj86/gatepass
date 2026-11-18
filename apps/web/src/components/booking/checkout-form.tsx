"use client";

import { checkoutSchema } from "@gatepass/shared";
import { useEffect, useState } from "react";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { User } from "@/lib/types";
import { COUNTRIES, guessCountry } from "./countries";

/**
 * Collects what Dodo's 15 minute checkout needs (country and postal code),
 * validated with the same schema the API uses, then hands over to Dodo.
 */
export function CheckoutForm({
  eventId,
  user,
  onNoHolds,
}: {
  eventId: string;
  user: User | null;
  onNoHolds: () => void;
}) {
  const [country, setCountry] = useState("US");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => setCountry(guessCountry()), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = checkoutSchema.safeParse({
      eventId,
      name: form.get("name"),
      email: form.get("email"),
      country: form.get("country"),
      zipcode: form.get("zipcode"),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setError(undefined);
    setBusy(true);
    try {
      const { checkoutUrl } = await api<{ orderId: string; checkoutUrl: string }>("/api/orders", {
        method: "POST",
        body: parsed.data,
      });
      window.location.assign(checkoutUrl);
    } catch (err) {
      if (err instanceof ApiError && err.code === "no_holds") onNoHolds();
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="mt-5 grid gap-2" onSubmit={onSubmit} noValidate>
      <Field label="Name" error={errors.name}>
        <Input
          name="name"
          autoComplete="name"
          defaultValue={user?.name}
          aria-invalid={Boolean(errors.name) || undefined}
        />
      </Field>
      <Field label="Email for tickets" error={errors.email}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={user?.email}
          aria-invalid={Boolean(errors.email) || undefined}
        />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
        <Field label="Country" error={errors.country}>
          <Select name="country" value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Postal code" error={errors.zipcode}>
          <Input name="zipcode" autoComplete="postal-code" aria-invalid={Boolean(errors.zipcode) || undefined} />
        </Field>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button type="submit" busy={busy}>
        Pay with Dodo Payments
      </Button>
    </form>
  );
}
