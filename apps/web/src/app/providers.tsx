"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { publicEnv } from "@/lib/env.ts";
import { createAppRuntime } from "@/lib/runtime.ts";
import { IdentityProvider } from "@/lib/use-identity.tsx";
import { RuntimeContext } from "@/lib/use-runtime.ts";

export function Providers({ children }: { children: ReactNode }) {
  // Created once per browser session. Blocks land every few hundred milliseconds, so data goes stale fast:
  // queries opt into their own refetch intervals instead of relying on a long global cache.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 2_000, retry: 2 } } }),
  );
  const [runtime] = useState(() => createAppRuntime(publicEnv));

  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeContext value={runtime}>
        <IdentityProvider>{children}</IdentityProvider>
      </RuntimeContext>
    </QueryClientProvider>
  );
}
