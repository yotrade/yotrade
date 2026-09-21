import type { HermesOptions } from "@yotrade/plugin-perps/hermes";

import { parseServerEnv } from "@/lib/server-env.ts";

/** Servers talk to Hermes directly with the key. Null when futures are not configured. */
export function serverHermes(): HermesOptions | null {
  const env = parseServerEnv({
    PYTH_API_KEY: process.env["PYTH_API_KEY"],
    PYTH_HERMES_URL: process.env["PYTH_HERMES_URL"],
  });
  return env.PYTH_API_KEY
    ? { baseUrl: env.PYTH_HERMES_URL, headers: { authorization: `Bearer ${env.PYTH_API_KEY}` } }
    : null;
}
