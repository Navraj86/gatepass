"use client";

import type { SeatMapSeat, SeatState } from "@gatepass/shared";
import { useMemo, useState } from "react";
import { Button, Select } from "@/components/ui";
import { formatMoney } from "@/lib/format";

const rowOrder = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

/**
 * Picks `count` seats side by side in the frontmost row of a section that has
 * room, falling back to the first free seats. Works without a pointer, so the
 * map is usable from a keyboard too.
 */
export function pickBestAvailable(
  seats: SeatMapSeat[],
  stateOf: (id: string) => SeatState,
  sectionId: string,
  count: number,
): string[] {
  const rows = new Map<string, SeatMapSeat[]>();
  for (const s of seats) {
    if (s.sectionId !== sectionId) continue;
    rows.set(s.rowLabel, [...(rows.get(s.rowLabel) ?? []), s]);
  }
  const free: string[] = [];
  for (const label of [...rows.keys()].sort(rowOrder)) {
    const row = rows.get(label)!.sort((a, b) => a.seatNumber - b.seatNumber);
    let run: string[] = [];
    for (const seat of row) {
      if (stateOf(seat.id) !== "available") {
        run = [];
        continue;
      }
      free.push(seat.id);
      run.push(seat.id);
      if (run.length === count) return run;
    }
  }
  return free.slice(0, count);
}

export function BestAvailable({
  seats,
  stateOf,
  max,
  disabled,
  onPick,
}: {
  seats: SeatMapSeat[];
  stateOf: (id: string) => SeatState;
  max: number;
  disabled: boolean;
  onPick: (seatIds: string[]) => void;
}) {
  const sections = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; priceMinor: number }>();
    for (const s of seats) byId.set(s.sectionId, { id: s.sectionId, name: s.sectionName, priceMinor: s.priceMinor });
    return [...byId.values()];
  }, [seats]);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [count, setCount] = useState(Math.min(2, max));

  return (
    <div className="mt-4 grid gap-2 border-t border-line pt-4">
      <span className="text-sm font-medium">Best available</span>
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <Select aria-label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {formatMoney(s.priceMinor)}
            </option>
          ))}
        </Select>
        <Select aria-label="Number of seats" value={count} onChange={(e) => setCount(Number(e.target.value))}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => onPick(pickBestAvailable(seats, stateOf, sectionId, Math.min(count, max)))}
      >
        Find seats
      </Button>
    </div>
  );
}
