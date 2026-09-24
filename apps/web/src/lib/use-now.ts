"use client";

import { useEffect, useState } from "react";

import { chainNow, syncChainClock } from "./chain-clock.ts";
import { useRuntime } from "./use-runtime.ts";

/**
 * Current time in whole seconds on the chain's clock, ticking. Drives countdowns and phase changes without a
 * refetch; the first one mounted reads the device's offset from the chain.
 */
export function useNow(): bigint {
  const { publicClient } = useRuntime();
  const [now, setNow] = useState(chainNow);
  useEffect(() => {
    syncChainClock(async () => (await publicClient.getBlock()).timestamp).then(() => setNow(chainNow()));
    const timer = setInterval(() => setNow(chainNow()), 1_000);
    return () => clearInterval(timer);
  }, [publicClient]);
  return now;
}
