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

function describe(scan: ScanResult): { title: string; detail: string; who?: string; ok: boolean; tone: string } {
  switch (scan.result) {
    case "valid":
      return {
        ok: true,
        tone: "bg-accent text-accent-ink",
        title: "Valid",
        detail: `${scan.seat.sectionName}, row ${scan.seat.rowLabel}, seat ${scan.seat.seatNumber}`,
        who: scan.holderName,
      };
    case "duplicate":
      return {
        ok: false,
        tone: "bg-accent-2 text-accent-2-ink",
        title: "Already scanned",
        detail: `${formatDateTime(scan.scannedAt)} by ${scan.scannedByName}`,
      };
    case "refunded":
      return {
        ok: false,
        tone: "bg-error text-paper",
        title: "Refunded",
        detail: "This ticket was refunded and is void.",
      };
    case "wrong_event":
      return {
        ok: false,
        tone: "bg-error text-paper",
        title: "Wrong event",
        detail: `This ticket is for ${scan.eventTitle}.`,
      };
    default:
      return {
        ok: false,
        tone: "bg-error text-paper",
        title: "Not a ticket",
        detail: "This code is not a Gatepass ticket.",
      };
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
    <div className="mx-auto grid max-w-xl grid-cols-[minmax(0,1fr)] gap-5">
      <div className="bar-top flex items-end justify-between gap-4 pt-4">
        <div className="min-w-0">
          <h1 className="text-2xl">{event?.title ?? "Scanner"}</h1>
          <Link href="/staff" className="link label mt-2 inline-flex min-h-11 items-center text-md">
            Change event
          </Link>
        </div>
        {event ? (
          <p className="shrink-0 text-right">
            <span className="figure block text-4xl">{event.checkedIn}</span>
            <span className="label text-ink-2">of {event.validTickets} in</span>
          </p>
        ) : null}
      </div>

      <Camera onCode={scan} paused={Boolean(showing)} />

      <form
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
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
          className="font-outlier tabular-nums"
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
          <h2 className="mb-3 text-lg">Last scans</h2>
          <ul className="bar-top">
            {log.map((entry) => {
              const d = describe(entry.scan);
              return (
                <li key={entry.id} className="flex items-center gap-3 border-b border-b-rule py-2.5">
                  <span className={cx("label w-28 shrink-0 px-2 py-0.5 text-center", d.tone)}>{d.title}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
                    {d.detail}
                    {d.who ? `, ${d.who}` : ""}
                  </span>
                  <span className="label tabular-nums text-ink-2">
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
            "verdict fixed inset-0 z-(--z-modal) flex flex-col items-start justify-end gap-4 p-6 text-left sm:p-12",
            shown.tone,
          )}
          onClick={() => setShowing(undefined)}
        >
          <span className="wordmark text-[clamp(3rem,14vw,9rem)]">{shown.title}</span>
          <span className="figure max-w-2xl text-2xl sm:text-3xl">{shown.detail}</span>
          {shown.who ? <span className="label text-xl">{shown.who}</span> : null}
          <span className="label mt-6 whitespace-nowrap text-md">Tap to scan the next ticket</span>
        </button>
      ) : null}
    </div>
  );
}

export default function ScanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <RequireUser roles={["staff", "organizer"]}>{() => <Scanner eventId={eventId} />}</RequireUser>;
}
