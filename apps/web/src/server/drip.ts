import { type Address, type Hash, parseEther } from "viem";

/** Joining costs about 0.13 MON and a swap about 0.05, so this covers a join and a few trades. */
export const DRIP_AMOUNT = parseEther("0.4");
/** Below this an account cannot reliably pay for a swap: Monad charges the gas limit, about 0.05 MON each. */
export const MIN_BALANCE = parseEther("0.1");
const ADDRESS_COOLDOWN_MS = 10 * 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_PER_IP_PER_HOUR = 5;
const MAX_PER_HOUR = 60;

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

/**
 * Tops accounts up with testnet MON.
 * ponytail: limits live in memory, so they reset on restart and are per instance. Move to a shared store
 * (Redis/KV) before running more than one instance.
 */
export function createDripper({ getBalance, send, now = Date.now }: DripDeps) {
  const lastByAddress = new Map<string, number>();
  const byIp = new Map<string, number[]>();
  let all: number[] = [];
  // Monad's pending nonce lags, so sends from one wallet must not overlap.
  let queue: Promise<unknown> = Promise.resolve();

  const recent = (times: number[], at: number) => times.filter((time) => at - time < HOUR_MS);

  function limit(address: Address, ip: string, at: number): number | null {
    const last = lastByAddress.get(address.toLowerCase());
    if (last !== undefined && at - last < ADDRESS_COOLDOWN_MS) {
      return last + ADDRESS_COOLDOWN_MS;
    }
    const mine = recent(byIp.get(ip) ?? [], at);
    byIp.set(ip, mine);
    all = recent(all, at);
    const oldest = mine.length >= MAX_PER_IP_PER_HOUR ? mine[0] : undefined;
    const oldestGlobal = all.length >= MAX_PER_HOUR ? all[0] : undefined;
    const blockedSince = oldest ?? oldestGlobal;
    return blockedSince === undefined ? null : blockedSince + HOUR_MS;
  }

  return function drip(address: Address, ip: string): Promise<DripResult> {
    const run = async (): Promise<DripResult> => {
      const at = now();
      const retryAt = limit(address, ip, at);
      if (retryAt !== null) {
        return { status: "limited", retryAt };
      }
      if ((await getBalance(address)) >= MIN_BALANCE) {
        return { status: "sufficient" };
      }
      // Recorded before sending: a failed send still counts, so errors cannot be used to bypass the limits.
      lastByAddress.set(address.toLowerCase(), at);
      byIp.set(ip, [...(byIp.get(ip) ?? []), at]);
      all.push(at);
      return { status: "funded", hash: await send(address, DRIP_AMOUNT) };
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
}
