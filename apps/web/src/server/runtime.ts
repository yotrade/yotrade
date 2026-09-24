import { publicEnv } from "@/lib/env.ts";
import { createAppRuntime } from "@/lib/runtime.ts";
import { parseServerEnv } from "@/lib/server-env.ts";
import { serverHermes } from "./hermes-options.ts";

/**
 * The runtime server code uses: the server's own Alchemy key when it has one, and Hermes called directly with
 * the Pyth key rather than through the browser proxy.
 */
export function serverRuntime() {
  const alchemy = parseServerEnv({
    ALCHEMY_API_KEY: process.env["ALCHEMY_API_KEY"],
  }).ALCHEMY_API_KEY;
  return createAppRuntime(
    { ...publicEnv, NEXT_PUBLIC_ALCHEMY_API_KEY: alchemy ?? publicEnv.NEXT_PUBLIC_ALCHEMY_API_KEY },
    serverHermes() ?? undefined,
  );
}
