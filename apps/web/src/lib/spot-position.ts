import type { DataPosition } from "@yotrade/plugin-kuru/data";

export interface SpotPosition {
  /** What the holding cost, in raw USDC. Null when Kuru has no fills behind it. */
  readonly cost: bigint | null;
  /** Value at the book minus cost, in raw USDC. */
  readonly pnl: bigint | null;
  /** Average price paid per whole token, in dollars. */
  readonly entry: number | null;
}

const USDC = 1e6;

/**
 * A spot holding with its cost basis from Kuru's own position record, the same numbers the leaderboard scores.
 * Tokens held beyond what fills bought are costed at the same average; tokens only ever come from fills here.
 */
export function spotPosition(
  held: bigint,
  valueUsdc: bigint,
  baseDecimals: number,
  open: Pick<DataPosition, "openSize" | "openCost"> | undefined,
): SpotPosition {
  if (!open || open.openSize <= 0n || held === 0n) {
    return { cost: null, pnl: null, entry: null };
  }
  const cost = (open.openCost * held) / open.openSize;
  const entry = Number(open.openCost) / USDC / (Number(open.openSize) / 10 ** baseDecimals);
  return { cost, pnl: valueUsdc - cost, entry };
}
