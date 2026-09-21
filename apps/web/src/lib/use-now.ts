"use client";

import { useEffect, useState } from "react";

/** Current time in whole seconds, ticking. Drives countdowns and phase changes without a refetch. */
export function useNow(): bigint {
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  useEffect(() => {
    const timer = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
