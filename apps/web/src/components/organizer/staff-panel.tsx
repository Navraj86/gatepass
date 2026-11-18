"use client";

import { assignStaffSchema } from "@gatepass/shared";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { StaffMember } from "@/lib/types";

/** Door staff need a staff account first; assigning lets them scan this event only. */
export function StaffPanel({ eventId }: { eventId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStaff((await api<{ staff: StaffMember[] }>(`/api/organizer/events/${eventId}/staff`)).staff);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    const parsed = assignStaffSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await api(`/api/organizer/events/${eventId}/staff`, { method: "POST", body: parsed.data });
      setEmail("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function unassign(userId: string) {
    setError(undefined);
    try {
      await api(`/api/organizer/events/${eventId}/staff/${userId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card>
      <h2 className="text-2xl">Door staff</h2>
      <p className="mt-2 text-ink-2">Assigned staff can scan tickets for this event.</p>
      {staff.length > 0 ? (
        <ul className="mt-4 divide-y divide-rule border-y-4 border-y-ink">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block font-semibold">{s.name}</span>
                <span className="block truncate text-sm text-ink-2">{s.email}</span>
              </span>
              <Button variant="danger" small onClick={() => unassign(s.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2" onSubmit={assign} noValidate>
        <Input
          type="email"
          aria-label="Staff email"
          placeholder="staff@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="secondary" busy={busy}>
          Assign
        </Button>
      </form>
      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </Card>
  );
}
