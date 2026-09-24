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
 * PnL over the window = realized PnL of its fills + unrealized PnL at the end − unrealized PnL at the start,
 * where unrealized is inventory at the mark minus what it cost. The last term keeps a bag bought before the start
 * from scoring its earlier drift. Money moved in or out of the account is never a fill, so it cannot change it.
 * `markAtStart` returns null when a market has no price then; that inventory then counts from its cost.
 */
export function pnlOf(
  performance: Performance,
  markAtEnd: (market: Address, baseAmount: bigint) => bigint,
  markAtStart: (market: Address, baseAmount: bigint) => bigint | null,
): bigint {
  const unrealized = (
    positions: Performance["positions"],
    mark: (market: Address, baseAmount: bigint) => bigint | null,
  ) =>
    positions.reduce((sum, position) => {
      const value = position.openSize === 0n ? 0n : mark(position.market, position.openSize);
      return value === null ? sum : sum + value - position.openCost;
    }, 0n);
  return (
    performance.realizedUsdc +
    unrealized(performance.positions, markAtEnd) -
    unrealized(performance.opening, markAtStart)
  );
}

/** A base amount at one price, in raw quote units, rounded down. */
export function valueAt(
  baseAmount: bigint,
  price: bigint,
  pricePrecision: bigint,
  baseDecimals: number,
  quoteDecimals: number,
): bigint {
  return (
    (baseAmount * price * 10n ** BigInt(quoteDecimals)) /
    (pricePrecision * 10n ** BigInt(baseDecimals))
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
