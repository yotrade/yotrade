import { type Hex, hexToBytes, http } from "viem";
import { monadTestnet } from "viem/chains";

import { createRuntime } from "@yotrade/core/plugin";
import { alchemyTransport } from "@yotrade/plugin-alchemy/transport";
import { kuru } from "@yotrade/plugin-kuru/plugin";
import { mera, type PrfSource } from "@yotrade/plugin-mera/plugin";
import { type HermesOptions, hermes } from "@yotrade/plugin-perps/hermes";
import { perps } from "@yotrade/plugin-perps/plugin";
import { tournament } from "@yotrade/plugin-tournament/plugin";

import type { PublicEnv } from "./env.ts";

/**
 * Stands in for WebAuthn during local end-to-end runs. `process.env.NODE_ENV` is inlined at build time, so in a
 * production bundle this returns `undefined` no matter what the environment says.
 */
function e2eSource(seed: string | undefined): PrfSource | undefined {
  if (process.env.NODE_ENV === "production" || !seed) {
    return undefined;
  }
  // A fresh copy each time: the identity wipes the entropy it is given.
  const result = () => Promise.resolve({ credentialId: "e2e", prfOutput: hexToBytes(seed as Hex) });
  return { register: result, signIn: result };
}

/** Browsers reach Hermes through our proxy, which holds the key. Servers pass the real endpoint instead. */
const BROWSER_HERMES: HermesOptions = { baseUrl: "/api/pyth" };

/** Every integration the app talks to, wired once. Alchemy is used when a key is configured. */
export function createAppRuntime(env: PublicEnv, hermesOptions: HermesOptions = BROWSER_HERMES) {
  const transport = env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? alchemyTransport(env.NEXT_PUBLIC_ALCHEMY_API_KEY, monadTestnet.id)
    : http(env.NEXT_PUBLIC_RPC_URL);

  const source = e2eSource(env.NEXT_PUBLIC_E2E_PRF_SEED);

  return createRuntime({
    chain: monadTestnet,
    transport,
    plugins: [
      kuru(),
      tournament(),
      perps({ hermes: hermes(hermesOptions) }),
      mera({ rp: { id: env.NEXT_PUBLIC_RP_ID, name: "YoTrade" }, ...(source ? { source } : {}) }),
    ],
  });
}

export type AppRuntime = ReturnType<typeof createAppRuntime>;
