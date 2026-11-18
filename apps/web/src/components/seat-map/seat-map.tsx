"use client";

import type { SeatMapSeat, SeatState } from "@gatepass/shared";
import { memo, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { formatMoney } from "@/lib/format";

const PITCH = 16;
const SIZE = 12;
const LABEL = 30;
const SECTION_GAP = 34;
const TOP = 48;

type LaidSeat = {
  id: string;
  sectionId: string;
  x: number;
  y: number;
  row: string;
  number: number;
  section: string;
  priceMinor: number;
};

type Layout = {
  width: number;
  height: number;
  seats: LaidSeat[];
  rowLabels: { key: string; label: string; y: number; xLeft: number; xRight: number }[];
  sections: { id: string; name: string; priceMinor: number; y: number }[];
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
  for (const [sectionId, section] of sections) {
    y += 22;
    layout.sections.push({ id: sectionId, name: section.name, priceMinor: section.priceMinor, y: y - 8 });
    for (const label of [...section.rows.keys()].sort(rowOrder)) {
      const row = section.rows.get(label)!.sort((a, b) => a.seatNumber - b.seatNumber);
      const offset = LABEL + (inner - row.length * PITCH) / 2;
      row.forEach((seat, i) => {
        layout.seats.push({
          id: seat.id,
          sectionId,
          x: offset + i * PITCH,
          y,
          row: label,
          number: seat.seatNumber,
          section: section.name,
          priceMinor: section.priceMinor,
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

type Props = {
  seats: SeatMapSeat[];
  stateOf: (seatId: string) => SeatState;
  selected: Set<string>;
  mine: Set<string>;
  disabled: boolean;
  onToggle: (seatId: string) => void;
  /** Dims every other section, from the price tiers above the map. */
  focusSection?: string | null;
  /** Seats someone else just took; they flash once in the second pass. */
  flashes?: Set<string>;
};

const STATE_WORD: Record<string, string> = {
  available: "Open",
  held: "Held by someone",
  sold: "Sold",
  blocked: "Not for sale",
  mine: "Held by you",
  selected: "Selected",
};

export const SeatMap = memo(function SeatMap({
  seats,
  stateOf,
  selected,
  mine,
  disabled,
  onToggle,
  focusSection,
  flashes,
}: Props) {
  const layout = useMemo(() => computeLayout(seats), [seats]);
  const byId = useMemo(() => new Map(layout.seats.map((s) => [s.id, s])), [layout]);
  const frame = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number }>();

  const tipSeat = tip ? byId.get(tip.id) : undefined;
  const tipState = tipSeat
    ? mine.has(tipSeat.id)
      ? "mine"
      : selected.has(tipSeat.id)
        ? "selected"
        : stateOf(tipSeat.id)
    : null;

  return (
    <div
      ref={frame}
      className="relative"
      onPointerLeave={() => setTip(undefined)}
      onPointerOver={(e) => {
        const id = (e.target as SVGElement).dataset?.seat;
        const box = frame.current?.getBoundingClientRect();
        if (!id || !box || e.pointerType === "touch") return setTip(undefined);
        const r = (e.target as SVGElement).getBoundingClientRect();
        setTip({ id, x: r.left + r.width / 2 - box.left, y: r.top - box.top });
      }}
    >
      <div className="overflow-x-auto overscroll-x-contain" onScroll={() => setTip(undefined)}>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users pick seats with Best available */}
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto w-full min-w-[560px] select-none"
          role="img"
          aria-label="Seat map"
          onClick={(e) => {
            const target = e.target as SVGElement;
            const id = target.dataset?.seat;
            if (id && target.dataset.clickable === "true" && !disabled) onToggle(id);
          }}
        >
          <rect x={LABEL} y={8} width={layout.width - LABEL * 2} height={24} className="fill-ink" />
          <text x={layout.width / 2} y={24.5} textAnchor="middle" fontSize={11} className="map-text fill-paper">
            Stage
          </text>

          {layout.sections.map((s) => (
            <text
              key={s.id}
              x={LABEL}
              y={s.y}
              fontSize={11}
              className={cx("map-text fill-ink seat", focusSection && focusSection !== s.id && "seat--dim")}
            >
              {s.name}
              <tspan className="fill-muted">
                {"  "}
                {formatMoney(s.priceMinor)}
              </tspan>
            </text>
          ))}

          {layout.rowLabels.map((r) => (
            <g key={r.key} fontSize={8} className="map-text fill-muted">
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
            const flash = !isMine && !isSelected && flashes?.has(seat.id) && (state === "held" || state === "sold");
            return (
              <rect
                key={seat.id}
                data-seat={seat.id}
                data-clickable={clickable ? "true" : undefined}
                x={seat.x}
                y={seat.y}
                width={SIZE}
                height={SIZE}
                className={cx(
                  "seat",
                  `seat--${key}`,
                  clickable && "seat--clickable",
                  flash && "seat--flash",
                  focusSection && focusSection !== seat.sectionId && "seat--dim",
                )}
              />
            );
          })}
        </svg>
      </div>

      {tip && tipSeat && tipState ? (
        <div className="seat-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
          Row {tipSeat.row} seat {tipSeat.number}, {tipSeat.section}
          <span className="block font-body text-xs font-normal text-on-ink-muted">
            {STATE_WORD[tipState] ?? tipState}
            {tipState === "available" || tipState === "selected" ? `, ${formatMoney(tipSeat.priceMinor)}` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
});

export function SeatLegend() {
  const items = [
    ["available", "Open"],
    ["selected", "Selected"],
    ["mine", "Held by you"],
    ["held", "Held"],
    ["sold", "Sold"],
  ] as const;
  return (
    <ul className="label flex flex-wrap gap-x-5 gap-y-2 text-ink-2">
      {items.map(([key, label]) => (
        <li key={key} className="flex items-center gap-2">
          <svg aria-hidden viewBox="0 0 12 12" className="size-3">
            <rect width="12" height="12" className={`seat--${key}`} />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}
