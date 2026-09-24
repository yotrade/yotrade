/**
 * The chain's time, as far as this device can tell. A phone whose clock runs minutes off would otherwise show
 * a tournament as live before the chain does, offer Start now after the start, or build a start time the
 * contract rejects. One read of the latest block's timestamp fixes the offset for the session.
 */

/** Block timestamps trail the wall clock by a block or so; a smaller gap than this is that, not skew. */
const NOISE_MS = 3_000;

let offsetMs = 0;
let syncing: Promise<void> | null = null;

/** How far the local clock is behind the chain, in ms, ignoring the gap a fresh block always has. */
export function offsetFrom(blockSeconds: bigint, localMs: number): number {
  const offset = Number(blockSeconds) * 1000 - localMs;
  return Math.abs(offset) < NOISE_MS ? 0 : offset;
}

/** Now, in ms, on the chain's clock. */
export function chainNowMs(): number {
  return Date.now() + offsetMs;
}

/** Now, in whole seconds, on the chain's clock. */
export function chainNow(): bigint {
  return BigInt(Math.floor(chainNowMs() / 1000));
}

/** Reads the offset once per session. A failed read leaves the local clock as it is and tries again later. */
export function syncChainClock(latestBlockSeconds: () => Promise<bigint>): Promise<void> {
  syncing ??= latestBlockSeconds()
    .then((seconds) => {
      offsetMs = offsetFrom(seconds, Date.now());
    })
    .catch(() => {
      syncing = null;
    });
  return syncing;
}
