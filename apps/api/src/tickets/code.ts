import { randomBytes } from "node:crypto";
import { encodeTicketCode } from "@gatepass/shared";

/** 128 random bits, base32: never sequential, never guessable. */
export function newTicketCode(): string {
  return encodeTicketCode(randomBytes(16));
}
