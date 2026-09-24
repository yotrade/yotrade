import { type Address, type Hash, parseEther } from "viem";

/** Joining costs about 0.13 MON and a swap about 0.05, so this covers a join and a few trades. */
export const DRIP_AMOUNT = parseEther("0.4");
/** Below this an account cannot reliably pay for a swap: Monad charges the gas limit, about 0.05 MON each. */
export const MIN_BALANCE = parseEther("0.1");
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** Two MON a day: a join and some forty trades. Keyed by address, so no forwarded header can widen it. */
const MAX_PER_ADDRESS_PER_DAY = 5;
/** A room of judges shares one address: enough for the room, still nothing to farm. */
const MAX_PER_IP_PER_HOUR = 20;
const MAX_PER_HOUR = 60;
/** Past this many keys a map is swept of everything that has aged out, so forged IPs cannot grow it forever. */
const SWEEP_AT = 1_000;

export type DripResult =
  | { readonly status: "funded"; readonly hash: Hash }
  | { readonly status: "sufficient" }
  | { readonly status: "limited"; readonly retryAt: number };

export interface DripDeps {
  getBalance(address: Address): Promise<bigint>;
  /** Sends `value` and resolves once the receipt is in. */
  send(to: Address, value: bigint): Promise<Hash>;
  now?: () => number;
}

/** Times within `window` of `at`, oldest first. */
const within = (times: readonly number[] | undefined, at: number, window: number) =>
  (times ?? []).filter((time) => at - time < window);

/**
 * Tops accounts up with testnet MON. The caps are checked before anything else and again right before the
 * send, and only the send is queued: a flood of requests is turned away without touching the RPC or the queue.
 * ponytail: limits live in memory, so they reset on restart and are per instance. Move to a shared store
 * (Redis/KV) before running more than one instance.
 */
export function createDripper({ getBalance, send, now = Date.now }: DripDeps) {
  const byAddress = new Map<string, number[]>();
  const byIp = new Map<string, number[]>();
  let all: number[] = [];
  // Monad's pending nonce lags, so sends from one wallet must not overlap.
  let queue: Promise<unknown> = Promise.resolve();

  function sweep(map: Map<string, number[]>, at: number, window: number) {
    if (map.size < SWEEP_AT) {
      return;
    }
    for (const [key, times] of map) {
      if (within(times, at, window).length === 0) {
        map.delete(key);
      }
    }
  }

  /** When the caller may try again, or null when every cap has room. Forgets what has aged out. */
  function limit(address: string, ip: string, at: number): number | null {
    sweep(byAddress, at, DAY_MS);
    sweep(byIp, at, HOUR_MS);
    const mine = within(byAddress.get(address), at, DAY_MS);
    const theirs = within(byIp.get(ip), at, HOUR_MS);
    all = within(all, at, HOUR_MS);
    for (const [map, key, times] of [
      [byAddress, address, mine],
      [byIp, ip, theirs],
    ] as const) {
      if (times.length === 0) {
        map.delete(key);
      } else {
        map.set(key, times);
      }
    }
    const blocked = [
      mine.length >= MAX_PER_ADDRESS_PER_DAY ? (mine[0] ?? at) + DAY_MS : null,
      theirs.length >= MAX_PER_IP_PER_HOUR ? (theirs[0] ?? at) + HOUR_MS : null,
      all.length >= MAX_PER_HOUR ? (all[0] ?? at) + HOUR_MS : null,
    ].filter((time) => time !== null);
    return blocked.length === 0 ? null : Math.max(...blocked);
  }

  return async function drip(recipient: Address, ip: string): Promise<DripResult> {
    const address = recipient.toLowerCase();
    const early = limit(address, ip, now());
    if (early !== null) {
      return { status: "limited", retryAt: early };
    }
    if ((await getBalance(recipient)) >= MIN_BALANCE) {
      return { status: "sufficient" };
    }
    const run = async (): Promise<DripResult> => {
      const at = now();
      // Requests that passed the first check together are queued together: only the first ones still fit.
      const retryAt = limit(address, ip, at);
      if (retryAt !== null) {
        return { status: "limited", retryAt };
      }
      // Recorded before sending: a failed send still counts, so errors cannot be used to bypass the limits.
      byAddress.set(address, [...(byAddress.get(address) ?? []), at]);
      byIp.set(ip, [...(byIp.get(ip) ?? []), at]);
      all.push(at);
      return { status: "funded", hash: await send(recipient, DRIP_AMOUNT) };
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
}
