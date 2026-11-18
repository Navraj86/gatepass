"use client";

import { normalizeTicketCode } from "@gatepass/shared";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { RequireUser } from "@/components/require-user";
import { Camera } from "@/components/staff/camera";
import { signal } from "@/components/staff/feedback";
import { Button, cx, Input, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { ScanResult, StaffEvent } from "@/lib/types";

type Logged = { id: number; at: Date; code: string; scan: ScanResult };

const SHOW_MS = 1800;
const REPEAT_MS = 4000;

function describe(scan: ScanResult): { title: string; detail: string; ok: boolean; tone: string } {
  switch (scan.result) {
    case "valid":
      return {
        ok: true,
        tone: "bg-ok",
        title: "Valid",
        detail: `${scan.seat.sectionName}, row ${scan.seat.rowLabel}, seat ${scan.seat.seatNumber} · ${scan.holderName}`,
      };
    case "duplicate":
      return {
        ok: false,
        tone: "bg-warn",
        title: "Already scanned",
        detail: `${formatDateTime(scan.scannedAt)} by ${scan.scannedByName}`,
      };
    case "refunded":
      return { ok: false, tone: "bg-bad", title: "Refunded", detail: "This ticket was refunded and is void." };
    case "wrong_event":
      return { ok: false, tone: "bg-bad", title: "Wrong event", detail: `This ticket is for ${scan.eventTitle}.` };
    default:
      return { ok: false, tone: "bg-bad", title: "Not a ticket", detail: "This code is not a Gatepass ticket." };
  }
}

function Scanner({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<StaffEvent>();
  const [showing, setShowing] = useState<Logged>();
  const [log, setLog] = useState<Logged[]>([]);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const lastCode = useRef<{ code: string; at: number }>(undefined);
  const nextId = useRef(1);

  const loadEvent = useCallback(async () => {
    try {
      const { events } = await api<{ events: StaffEvent[] }>("/api/staff/events");
      setEvent(events.find((e) => e.id === eventId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [eventId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  const scan = useCallback(
    async (raw: string) => {
      const code = normalizeTicketCode(raw) || raw.trim();
      const now = Date.now();
      // The camera reports the same QR many times a second; ignore repeats for a few seconds.
      if (busy.current || (lastCode.current?.code === code && now - lastCode.current.at < REPEAT_MS)) return;
      busy.current = true;
      lastCode.current = { code, at: now };
      setError(undefined);
      try {
        const result = await api<ScanResult>("/api/staff/scan", { method: "POST", body: { eventId, code } });
        const entry = { id: nextId.current++, at: new Date(), code, scan: result };
        signal(result.result === "valid");
        setShowing(entry);
        setLog((prev) => [entry, ...prev].slice(0, 10));
        if (result.result === "valid") {
          setEvent((e) => (e ? { ...e, checkedIn: e.checkedIn + 1 } : e));
        }
        setTimeout(() => setShowing((s) => (s?.id === entry.id ? undefined : s)), SHOW_MS);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        busy.current = false;
      }
    },
    [eventId],
  );

  const shown = showing ? describe(showing.scan) : undefined;

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{event?.title ?? "Scanner"}</h1>
          <Link href="/staff" className="text-sm text-muted">
            Change event
          </Link>
        </div>
        {event ? (
          <p className="text-right text-sm">
            <span className="text-2xl font-semibold tabular-nums">{event.checkedIn}</span>
            <span className="text-muted"> / {event.validTickets} in</span>
          </p>
        ) : null}
      </div>

      <Camera onCode={scan} paused={Boolean(showing)} />

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) {
            lastCode.current = undefined;
            void scan(manual).then(() => setManual(""));
          }
        }}
      >
        <Input
          aria-label="Ticket code"
          placeholder="Type a ticket code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          Check
        </Button>
      </form>
      {error ? <Notice tone="error">{error}</Notice> : null}

      {log.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted">Last scans</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
            {log.map((entry) => {
              const d = describe(entry.scan);
              return (
                <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                  <span className={cx("size-2.5 shrink-0 rounded-full", d.tone)} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{d.title}</span> <span className="text-muted">{d.detail}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {entry.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {shown ? (
        <button
          type="button"
          aria-live="assertive"
          className={cx(
            "fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-8 text-center text-white",
            shown.tone,
          )}
          onClick={() => setShowing(undefined)}
        >
          <span className="text-5xl font-bold">{shown.title}</span>
          <span className="max-w-sm text-lg">{shown.detail}</span>
        </button>
      ) : null}
    </div>
  );
}

export default function ScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <RequireUser roles={["staff", "organizer"]}>{() => <Scanner eventId={eventId} />}</RequireUser>;
}
