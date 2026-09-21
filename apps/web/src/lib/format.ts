import { type Address, formatUnits } from "viem";
import { z } from "zod";

const USDC_DECIMALS = 6;
const MAX_NAME_LENGTH = 60;
const JSON_DATA_URI = "data:application/json,";

/** "1,234.50" from raw USDC units. */
export function formatUsdc(amount: bigint): string {
  return Number(formatUnits(amount, USDC_DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const metadataSchema = z.object({ name: z.string().trim().min(1) });

/** The organizer writes the metadata, so it is untrusted: anything unexpected falls back to a neutral name. */
export function tournamentName(id: bigint, metadataUri: string): string {
  const fallback = `Tournament #${id}`;
  if (!metadataUri.startsWith(JSON_DATA_URI)) {
    return fallback;
  }
  try {
    const raw: unknown = JSON.parse(decodeURIComponent(metadataUri.slice(JSON_DATA_URI.length)));
    const parsed = metadataSchema.safeParse(raw);
    return parsed.success ? parsed.data.name.slice(0, MAX_NAME_LENGTH) : fallback;
  } catch {
    return fallback;
  }
}

/** "2d 4h", "3h 12m", "45s". Empty once the moment has passed. */
export function timeUntil(targetSeconds: bigint, nowSeconds: bigint): string {
  let left = Number(targetSeconds - nowSeconds);
  if (left <= 0) {
    return "";
  }
  const parts: string[] = [];
  for (const [unit, size] of [["d", 86_400], ["h", 3_600], ["m", 60], ["s", 1]] as const) {
    if (left >= size && parts.length < 2) {
      parts.push(`${Math.floor(left / size)}${unit}`);
      left %= size;
    }
  }
  return parts.join(" ");
}

/** Time to the next boundary that matters: the start while upcoming, the end while live, nothing afterwards. */
export function timeLeft(
  phase: string,
  schedule: { startTime: bigint; endTime: bigint },
  nowSeconds: bigint,
): string {
  if (phase === "upcoming") {
    return timeUntil(schedule.startTime, nowSeconds);
  }
  return phase === "live" ? timeUntil(schedule.endTime, nowSeconds) : "";
}

/** The same as a sentence fragment for list rows: "Starts in 2h 5m", "3h left". */
export function countdown(
  phase: string,
  schedule: { startTime: bigint; endTime: bigint },
  nowSeconds: bigint,
): string {
  const left = timeLeft(phase, schedule, nowSeconds);
  if (left === "") {
    return "";
  }
  return phase === "upcoming" ? `Starts in ${left}` : `${left} left`;
}

/** Token amount for display: up to six decimals, no trailing noise. */
export function formatToken(amount: bigint, decimals: number): string {
  return Number(formatUnits(amount, decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}
