"use client";

import { useQuery } from "@tanstack/react-query";

import { useRuntime } from "./use-runtime.ts";

interface Scheduled {
  readonly startTime: bigint;
  readonly endTime: bigint;
}

/**
 * The indexed tournament with its start and end taken from the chain when the chain has answered. A host's
 * Start now moves both at once; the indexer follows seconds or minutes later, and nobody should wait for it.
 */
export function withChainSchedule<T extends Scheduled>(indexed: T, chain: Scheduled | undefined): T {
  if (!chain || (chain.startTime === indexed.startTime && chain.endTime === indexed.endTime)) {
    return indexed;
  }
  return { ...indexed, startTime: chain.startTime, endTime: chain.endTime };
}

/** The schedule as the contract holds it, polled while it can still change. */
export function useChainSchedule(id: string, enabled = true) {
  const { tournament } = useRuntime();
  return useQuery({
    queryKey: ["schedule", id],
    queryFn: async () => {
      const { config } = await tournament.get(BigInt(id));
      return { startTime: config.startTime, endTime: config.endTime };
    },
    enabled,
    refetchInterval: 10_000,
  });
}
