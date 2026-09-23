/**
 * Six-character room codes, Kahoot style. The code is the tournament id, mixed so that consecutive ids look
 * unrelated, with a checksum so a typo lands on "no such room" instead of someone else's tournament. Nothing is
 * stored: any device turns a code back into the id.
 *
 * 30 bits = 8 bits of checksum on top of 22 bits of id (four million tournaments), spread by an odd multiplier
 * modulo 2^30 and written in a 32-letter alphabet without 0/O, 1/I. Multiplication carries a change upward, so
 * with the checksum on top a typo in any position reaches it.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LENGTH = 6;
const BITS = 30n;
const MOD = 1n << BITS;
const ID_BITS = 22n;
const MAX_ID = (1n << ID_BITS) - 1n;
const MULTIPLIER = 0x2b3c4d5n; // odd, so invertible modulo 2^30
const MASK = 0x15a3c96n;

function inverse(a: bigint, m: bigint): bigint {
  // Newton iteration for the inverse of an odd number modulo a power of two.
  let x = a;
  for (let i = 0; i < 5; i++) {
    x = (x * (2n - a * x)) % m;
  }
  return ((x % m) + m) % m;
}
const INVERSE = inverse(MULTIPLIER, MOD);

const checksum = (id: bigint) => (id * 131n + 17n) & 0xffn;

/** The room code of a tournament. */
export function roomCode(id: bigint): string {
  if (id < 1n || id > MAX_ID) {
    throw new RangeError("Tournament id out of room-code range");
  }
  let value = (((checksum(id) << ID_BITS) | id) ^ MASK) * MULTIPLIER % MOD;
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code = ALPHABET[Number(value & 31n)] + code;
    value >>= 5n;
  }
  return code;
}

/** The tournament id behind a code, or null when the code is malformed or fails its checksum. */
export function roomId(input: string): bigint | null {
  const code = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== LENGTH) {
    return null;
  }
  let value = 0n;
  for (const char of code) {
    const digit = ALPHABET.indexOf(char);
    if (digit === -1) {
      return null;
    }
    value = (value << 5n) | BigInt(digit);
  }
  const mixed = ((value * INVERSE) % MOD) ^ MASK;
  const id = mixed & MAX_ID;
  return id >= 1n && mixed >> ID_BITS === checksum(id) ? id : null;
}

/** "K7X2PQ" as "K7X 2PQ": easier to read aloud and off a projector. */
export const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
