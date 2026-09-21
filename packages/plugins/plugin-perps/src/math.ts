/** The engine's arithmetic in bigint, for screens that must agree with the contract to the last unit. */
export const WAD = 10n ** 18n;
export const BPS = 10_000n;
export const STARTING_BALANCE = 10_000n * WAD;
export const FEE_BPS = 5n;
export const MAX_LEVERAGE = 20n;
export const MAINTENANCE_BPS = 250n;

export interface Position {
  /** Signed base units, 1e18. Positive is long. */
  readonly size: bigint;
  /** USD 1e18. */
  readonly entryPrice: bigint;
}

export interface Valued extends Position {
  /** Current price, USD 1e18. */
  readonly price: bigint;
}

const abs = (value: bigint) => (value < 0n ? -value : value);

export const notional = (size: bigint, price: bigint) => (abs(size) * price) / WAD;

/** Solidity divides toward zero and so does bigint, so this matches `PerpsMath.pnl` exactly. */
export const pnl = ({ size, entryPrice }: Position, price: bigint) =>
  (size * (price - entryPrice)) / WAD;

/** Rounded up, like the contract. */
export function fee(sizeDelta: bigint, price: bigint): bigint {
  const value = notional(sizeDelta, price) * FEE_BPS;
  return value === 0n ? 0n : (value - 1n) / BPS + 1n;
}

export interface Risk {
  readonly equity: bigint;
  readonly notional: bigint;
  /** Notional over equity, in hundredths (2050 is 20.5x). Zero when flat, null when equity is gone. */
  readonly leverageX100: bigint | null;
  readonly liquidatable: boolean;
}

function leverage(equity: bigint, total: bigint): bigint | null {
  if (total === 0n) {
    return 0n;
  }
  return equity > 0n ? (total * 100n) / equity : null;
}

export function risk(balance: bigint, positions: readonly Valued[]): Risk {
  const equity = positions.reduce((sum, p) => sum + pnl(p, p.price), balance);
  const total = positions.reduce((sum, p) => sum + notional(p.size, p.price), 0n);
  return {
    equity,
    notional: total,
    leverageX100: leverage(equity, total),
    liquidatable: equity * BPS < total * MAINTENANCE_BPS,
  };
}

/** Largest size (base units, unsigned) that a fill adding risk may add at `price` before the cap rejects it. */
export function maxAdd(current: Risk, price: bigint): bigint {
  if (current.equity <= 0n || price === 0n) {
    return 0n;
  }
  // The fee comes out of equity first: n + x <= 20 * (e - x * fee), solved for the added notional x.
  const room = current.equity * MAX_LEVERAGE - current.notional;
  if (room <= 0n) {
    return 0n;
  }
  const added = (room * BPS) / (BPS + MAX_LEVERAGE * FEE_BPS);
  return (added * WAD) / price;
}

/** Score in parts per million of the starting balance, floored at a total loss like the contract. */
export function roiPpm(equity: bigint): number {
  const floored = equity < 0n ? 0n : equity;
  return Number(((floored - STARTING_BALANCE) * 1_000_000n) / STARTING_BALANCE);
}

/** Pyth's `price * 10^expo` as USD 1e18. Mirrors `PerpsMath.toWad`. */
export function toWad(price: bigint, expo: number): bigint {
  if (price <= 0n || expo > 0 || expo < -18) {
    throw new Error(`Unusable Pyth price ${price}e${expo}`);
  }
  return price * 10n ** BigInt(18 + expo);
}
