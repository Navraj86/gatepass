export type HoldInput = {
  userId: string;
  eventId: string;
  seatIds: string[];
};

export type HoldResult =
  | { ok: true; seatIds: string[]; heldUntil: Date }
  | { ok: false; reason: "conflict" };

export async function holdSeats(_input: HoldInput): Promise<HoldResult> {
  throw new Error("Not implemented yet");
}
