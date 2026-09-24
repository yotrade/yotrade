/** The engine's arithmetic in bigint, for screens that must agree with the contract to the last unit. */
export const WAD = 10n ** 18n;
export const BPS = 10_000n;
export const STARTING_BALANCE = 10_000n * WAD;
export const FEE_BPS = 5n;
/** The cap of a tournament whose host never set one: 100x everywhere. The contract's `DEFAULT_LEVERAGE`. */
export const DEFAULT_LEVERAGE = 100n;
/** Hosts pick one of these; the contract refuses anything else. */
export const LEVERAGE_CAPS = [5n, 20n, 100n] as const;
/** Maintenance margin is half the initial margin: the contract's `MAINTENANCE_NUMERATOR / cap`. */
export const maintenanceBps = (cap: bigint) => 5_000n / cap;

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

export function risk(
  balance: bigint,
  positions: readonly Valued[],
  cap: bigint = DEFAULT_LEVERAGE,
): Risk {
  const equity = positions.reduce((sum, p) => sum + pnl(p, p.price), balance);
  const total = positions.reduce((sum, p) => sum + notional(p.size, p.price), 0n);
  return {
    equity,
    notional: total,
    leverageX100: leverage(equity, total),
    liquidatable: equity * BPS < total * maintenanceBps(cap),
  };
}

/**
 * The most margin (USD 1e18) an order at `multiple` can put up: the equity not already backing positions at the
 * cap, and no more than the cap's room once the fee is paid out of equity. At a multiple equal to the cap the
 * second bound is the tighter one, by exactly the fee.
 */
export function maxMargin(current: Risk, price: bigint, cap: bigint, multiple: bigint): bigint {
  const free = current.equity - current.notional / cap;
  if (free <= 0n || multiple <= 0n) {
    return 0n;
  }
  const room = (maxAdd(current, price, cap) * price) / WAD / multiple;
  return room < free ? room : free;
}

/** Largest size (base units, unsigned) that a fill adding risk may add at `price` before the cap rejects it. */
export function maxAdd(current: Risk, price: bigint, cap: bigint = DEFAULT_LEVERAGE): bigint {
  if (current.equity <= 0n || price === 0n) {
    return 0n;
  }
  // The fee comes out of equity first: n + x <= cap * (e - x * fee), solved for the added notional x.
  const room = current.equity * cap - current.notional;
  if (room <= 0n) {
    return 0n;
  }
  const added = (room * BPS) / (BPS + cap * FEE_BPS);
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

/** `PerpsMath.applyFill`: average in, reduce at the old entry, restart the entry after a flip. */
export function applyFill(
  position: Position,
  sizeDelta: bigint,
  price: bigint,
): { readonly next: Position; readonly realized: bigint } {
  const { size, entryPrice } = position;
  const newSize = size + sizeDelta;
  if (size === 0n || size > 0n === sizeDelta > 0n) {
    const entry = (abs(size) * entryPrice + abs(sizeDelta) * price) / abs(newSize);
    return { next: { size: newSize, entryPrice: entry }, realized: 0n };
  }
  const closed = abs(sizeDelta) < abs(size) ? abs(sizeDelta) : abs(size);
  const realized = pnl({ size: size > 0n ? closed : -closed, entryPrice }, price);
  if (newSize === 0n) {
    return { next: { size: 0n, entryPrice: 0n }, realized };
  }
  return {
    next: { size: newSize, entryPrice: newSize > 0n === size > 0n ? entryPrice : price },
    realized,
  };
}

/**
 * Price at which a position alone would take the account under maintenance, other positions standing still.
 * `otherNotional` is what the account's other markets hold: their maintenance is owed too, so it comes out of
 * the equity this position can lose. An estimate for the trader, never an input to anything: the contract
 * values the whole account live.
 */
export function liquidationPrice(
  equity: bigint,
  size: bigint,
  price: bigint,
  cap: bigint = DEFAULT_LEVERAGE,
  otherNotional = 0n,
): bigint | null {
  if (size === 0n) {
    return null;
  }
  const held = notional(size, price);
  const maintenance = maintenanceBps(cap);
  const spare = equity - (otherNotional * maintenance) / BPS;
  // Already under maintenance: out at the price it is at now, whichever side it is on.
  if (spare * BPS <= held * maintenance) {
    return price;
  }
  if (size > 0n) {
    // Fully collateralized longs cannot be liquidated by their own market.
    return held <= spare ? null : ((held - spare) * WAD * BPS) / (size * (BPS - maintenance));
  }
  return ((spare + held) * WAD * BPS) / (-size * (BPS + maintenance));
}

export interface Held extends Valued {
  readonly market: string;
}

export interface OrderPlan {
  readonly sizeDelta: bigint;
  readonly fee: bigint;
  readonly realized: bigint;
  readonly position: Position;
  readonly after: Risk;
  /** False when the contract would answer `ExceedsLeverage`. Fills that reduce risk always pass. */
  readonly withinCap: boolean;
  readonly liquidationPrice: bigint | null;
}

/** What a market order of `notionalUsd` would do, computed the way the contract will. */
export function planOrder(order: {
  readonly balance: bigint;
  readonly positions: readonly Held[];
  readonly market: string;
  readonly price: bigint;
  readonly side: "long" | "short";
  readonly notionalUsd: bigint;
  /** The tournament's leverage cap. */
  readonly cap?: bigint;
}): OrderPlan {
  const cap = order.cap ?? DEFAULT_LEVERAGE;
  const magnitude = (order.notionalUsd * WAD) / order.price;
  const sizeDelta = order.side === "long" ? magnitude : -magnitude;
  const market = order.market.toLowerCase();
  const current = order.positions.find((p) => p.market.toLowerCase() === market);
  const { next, realized } = applyFill(
    current ?? { size: 0n, entryPrice: 0n },
    sizeDelta,
    order.price,
  );
  const paid = fee(sizeDelta, order.price);
  const others = order.positions.filter((p) => p.market.toLowerCase() !== market);
  const held = next.size === 0n ? others : [...others, { ...next, price: order.price }];
  const after = risk(order.balance + realized - paid, held, cap);
  const was = current?.size ?? 0n;
  // Mirrors PerpsMath.addsRisk: bigger, or on the other side. A flip must pass the checks an open does.
  const addsRisk =
    abs(next.size) > abs(was) || (was > 0n && next.size < 0n) || (was < 0n && next.size > 0n);
  return {
    sizeDelta,
    fee: paid,
    realized,
    position: next,
    after,
    withinCap: !addsRisk || (after.equity > 0n && after.notional <= after.equity * cap),
    liquidationPrice: liquidationPrice(
      after.equity,
      next.size,
      order.price,
      cap,
      others.reduce((sum, p) => sum + notional(p.size, p.price), 0n),
    ),
  };
}
