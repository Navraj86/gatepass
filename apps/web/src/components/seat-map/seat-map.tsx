"use client";

import type { SeatMapSeat, SeatState } from "@gatepass/shared";
import { memo, useMemo } from "react";
import { formatMoney } from "@/lib/format";

const PITCH = 16;
const SIZE = 12;
const LABEL = 30;
const SECTION_GAP = 34;
const TOP = 48;

type Layout = {
  width: number;
  height: number;
  seats: { id: string; x: number; y: number; title: string }[];
  rowLabels: { key: string; label: string; y: number; xLeft: number; xRight: number }[];
  sections: { name: string; priceMinor: number; y: number }[];
};

const rowOrder = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

/** Lays out sections top to bottom, rows centred, from the seat list alone. */
function computeLayout(seats: SeatMapSeat[]): Layout {
  const sections = new Map<string, { name: string; priceMinor: number; rows: Map<string, SeatMapSeat[]> }>();
  for (const seat of seats) {
    let section = sections.get(seat.sectionId);
    if (!section) {
      section = { name: seat.sectionName, priceMinor: seat.priceMinor, rows: new Map() };
      sections.set(seat.sectionId, section);
    }
    const row = section.rows.get(seat.rowLabel) ?? [];
    row.push(seat);
    section.rows.set(seat.rowLabel, row);
  }

  let maxSeats = 0;
  for (const s of sections.values()) for (const row of s.rows.values()) maxSeats = Math.max(maxSeats, row.length);
  const inner = maxSeats * PITCH;
  const width = inner + LABEL * 2;

  const layout: Layout = { width, height: 0, seats: [], rowLabels: [], sections: [] };
  let y = TOP;
  for (const section of sections.values()) {
    y += 22;
    layout.sections.push({ name: section.name, priceMinor: section.priceMinor, y: y - 8 });
    for (const label of [...section.rows.keys()].sort(rowOrder)) {
      const row = section.rows.get(label)!.sort((a, b) => a.seatNumber - b.seatNumber);
      const offset = LABEL + (inner - row.length * PITCH) / 2;
      row.forEach((seat, i) => {
        layout.seats.push({
          id: seat.id,
          x: offset + i * PITCH,
          y,
          title: `${section.name}, row ${label}, seat ${seat.seatNumber}`,
        });
      });
      layout.rowLabels.push({
        key: `${section.name}-${label}`,
        label,
        y: y + SIZE - 2,
        xLeft: offset - 8,
        xRight: offset + row.length * PITCH + 4,
      });
      y += PITCH;
    }
    y += SECTION_GAP - PITCH;
  }
  layout.height = y + 8;
  return layout;
}

const fill: Record<string, string> = {
  available: "var(--seat-available)",
  held: "var(--seat-held)",
  sold: "var(--seat-sold)",
  blocked: "var(--seat-sold)",
  mine: "var(--seat-mine)",
  selected: "var(--seat-selected)",
};

type Props = {
  seats: SeatMapSeat[];
  stateOf: (seatId: string) => SeatState;
  selected: Set<string>;
  mine: Set<string>;
  disabled: boolean;
  onToggle: (seatId: string) => void;
};

export const SeatMap = memo(function SeatMap({ seats, stateOf, selected, mine, disabled, onToggle }: Props) {
  const layout = useMemo(() => computeLayout(seats), [seats]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users pick seats with Best available
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="h-auto w-full min-w-[560px] select-none"
      role="img"
      aria-label="Seat map"
      onClick={(e) => {
        const id = (e.target as SVGElement).dataset?.seatId;
        if (id && !disabled) onToggle(id);
      }}
    >
      <rect x={LABEL} y={8} width={layout.width - LABEL * 2} height={22} rx={6} fill="var(--line)" />
      <text
        x={layout.width / 2}
        y={23}
        textAnchor="middle"
        fontSize={10}
        letterSpacing={4}
        fill="var(--muted)"
        fontWeight={600}
      >
        STAGE
      </text>

      {layout.sections.map((s) => (
        <text key={s.name} x={LABEL} y={s.y} fontSize={11} fontWeight={600} fill="var(--ink)">
          {s.name}
          <tspan fill="var(--muted)" fontWeight={400}>
            {"  "}
            {formatMoney(s.priceMinor)}
          </tspan>
        </text>
      ))}

      {layout.rowLabels.map((r) => (
        <g key={r.key} fontSize={8} fill="var(--muted)">
          <text x={r.xLeft} y={r.y} textAnchor="end">
            {r.label}
          </text>
          <text x={r.xRight} y={r.y}>
            {r.label}
          </text>
        </g>
      ))}

      {layout.seats.map((seat) => {
        const state = stateOf(seat.id);
        const isMine = mine.has(seat.id);
        const isSelected = selected.has(seat.id);
        const key = isMine ? "mine" : isSelected ? "selected" : state;
        const clickable = !disabled && (state === "available" || isSelected);
        return (
          <rect
            key={seat.id}
            data-seat-id={clickable ? seat.id : undefined}
            x={seat.x}
            y={seat.y}
            width={SIZE}
            height={SIZE}
            rx={3}
            fill={fill[key]}
            className={clickable ? "cursor-pointer transition-opacity hover:opacity-70" : undefined}
          >
            <title>{`${seat.title} (${isMine ? "held by you" : state})`}</title>
          </rect>
        );
      })}
    </svg>
  );
});

export function SeatLegend() {
  const items = [
    ["available", "Available"],
    ["selected", "Selected"],
    ["mine", "Held by you"],
    ["held", "Held"],
    ["sold", "Sold"],
  ] as const;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([key, label]) => (
        <li key={key} className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px]" style={{ background: fill[key] }} />
          {label}
        </li>
      ))}
    </ul>
  );
}
