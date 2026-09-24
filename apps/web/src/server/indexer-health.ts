import { publicEnv } from "@/lib/env.ts";

/** About ten minutes of Monad blocks: past this the lists and the board describe the past. */
export const MAX_LAG_BLOCKS = 1_500n;

export interface IndexerState {
  readonly ok: boolean;
  /** Blocks behind the chain, when the indexer answered. */
  readonly lag?: string;
}

/** Healthy when it answers and keeps up with the chain. */
export function indexerHealth(progress: bigint | null, chainBlock: bigint): IndexerState {
  if (progress === null) {
    return { ok: false };
  }
  const lag = chainBlock > progress ? chainBlock - progress : 0n;
  return { ok: lag <= MAX_LAG_BLOCKS, lag: lag.toString() };
}

/**
 * How far the indexer has processed, or null when it does not answer. The development-plan deployment it runs
 * on is deleted after 30 days, so "not answering" is an expected failure, and the watch workflow emails on it.
 */
export async function indexerProgress(timeoutMs = 5_000): Promise<bigint | null> {
  try {
    const response = await fetch(publicEnv.NEXT_PUBLIC_INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ _meta { progressBlock } }" }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    // biome-ignore lint/style/useNamingConvention: Envio's own metadata field
    const body = (await response.json()) as { data?: { _meta?: { progressBlock?: number }[] } };
    const progress = body.data?._meta?.[0]?.progressBlock;
    return typeof progress === "number" ? BigInt(progress) : null;
  } catch {
    return null;
  }
}
