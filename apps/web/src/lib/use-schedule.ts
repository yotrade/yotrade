"use client";

import { useQuery } from "@tanstack/react-query";

import { useRuntime } from "./use-runtime.ts";

export { withChainSchedule } from "./schedule.ts";

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
