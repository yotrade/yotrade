/** A countdown the back of the room can read: "4:07", "1:02:30", or "2d 4h" when it is days away. */
export function clock(seconds: bigint): string {
  const s = seconds < 0n ? 0n : seconds;
  if (s >= 86_400n) {
    return `${s / 86_400n}d ${(s % 86_400n) / 3_600n}h`;
  }
  const hours = s / 3_600n;
  const minutes = (s % 3_600n) / 60n;
  const rest = (s % 60n).toString().padStart(2, "0");
  return hours > 0n
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/** Where a phone should go to join: the invite link for a private room the host can open, else the room code. */
export function joinUrl(origin: string, code: string, invite: string | null): string {
  return invite ? invite : `${origin}/r/${code}`;
}
