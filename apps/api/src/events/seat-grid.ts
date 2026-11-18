/** Row labels A..Z, then AA, AB and so on, like a real venue. */
export function rowLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export type GridSeat = { rowLabel: string; seatNumber: number };

/** A rectangular block of seats: `rows` rows starting at `firstRow`, `seatsPerRow` each. */
export function seatGrid(rows: number, seatsPerRow: number, firstRow = 0): GridSeat[] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: seatsPerRow }, (_, s) => ({ rowLabel: rowLabel(firstRow + r), seatNumber: s + 1 })),
  ).flat();
}
