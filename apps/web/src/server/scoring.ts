import type { Performance } from "@yotrade/plugin-kuru/data";
import type { Address } from "viem";

export interface Scored {
  readonly participant: Address;
  readonly tradingAccount: Address;
  readonly joinedAt: bigint;
  readonly capitalAtJoin: bigint;
  /** Realized plus unrealized PnL in raw USDC units. */
  readonly pnl: bigint;
  /** Return on the capital at join, in parts per million. */
  readonly roiPpm: number;
  readonly fills: number;
}

const PPM = 1_000_000n;

/**
 * PnL = realized PnL of fills in the window + (open inventory at the mid − what it cost).
 * Money moved in or out of the account is never a fill, so it cannot change the score.
 */
export function pnlOf(
  performance: Performance,
  markToUsdc: (market: Address, baseAmount: bigint) => bigint,
): bigint {
  return performance.positions.reduce(
    (sum, position) => sum + markToUsdc(position.market, position.openSize) - position.openCost,
    performance.realizedUsdc,
  );
}

export function roiPpm(pnl: bigint, capitalAtJoin: bigint): number {
  return capitalAtJoin === 0n ? 0 : Number((pnl * PPM) / capitalAtJoin);
}

/** Best first. Equal returns go to whoever joined first, so the order is total and reproducible. */
export function rank(rows: readonly Scored[]): Scored[] {
  return [...rows].sort(
    (a, b) =>
      b.roiPpm - a.roiPpm ||
      Number(a.joinedAt - b.joinedAt) ||
      a.participant.localeCompare(b.participant),
  );
}

/** Prize ranks go to traders who actually traded: joining and sitting still never beats a loss by default. */
export function winnersOf(ranked: readonly Scored[], slots: number): Address[] {
  return ranked
    .filter((row) => row.fills > 0)
    .slice(0, slots)
    .map((row) => row.participant);
}
