/**
 * Ticket codes are 128 random bits in Crockford base32 (26 characters):
 * no I, L, O or U, so a code read aloud or typed by door staff is hard to get wrong.
 */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 26;

export function encodeTicketCode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CODE_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CODE_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Accepts what a person types: any case, spaces or dashes, O for 0, I and L for 1. */
export function normalizeTicketCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/** Groups a code for display: XXXXX-XXXXX-... */
export function formatTicketCode(code: string): string {
  return code.match(/.{1,5}/g)?.join("-") ?? code;
}
