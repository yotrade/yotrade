import { fallback, type Hex, hexToBytes, http } from "viem";
import { monadTestnet } from "viem/chains";

import { createRuntime } from "@yotrade/core/plugin";
import { alchemyTransport } from "@yotrade/plugin-alchemy/transport";
import { kuru } from "@yotrade/plugin-kuru/plugin";
import { mera, type PrfSource } from "@yotrade/plugin-mera/plugin";
import { type HermesOptions, hermes } from "@yotrade/plugin-perps/hermes";
import { perps } from "@yotrade/plugin-perps/plugin";
import { tournament } from "@yotrade/plugin-tournament/plugin";

import type { PublicEnv } from "./env.ts";
import { tabSession } from "./session-store.ts";

/**
 * Stands in for WebAuthn during local end-to-end runs. `process.env.NODE_ENV` is inlined at build time, so in a
 * production bundle this returns `undefined` no matter what the environment says.
 */
function e2eSource(seed: string | undefined): PrfSource | undefined {
  if (process.env.NODE_ENV === "production" || !seed || !e2eRequested()) {
    return undefined;
  }
  // A fresh copy each time: the identity wipes the entropy it is given.
  const result = () => Promise.resolve({ credentialId: "e2e", prfOutput: hexToBytes(seed as Hex) });
  return { register: result, signIn: result };
}

/** Browsers reach Hermes through our proxy, which holds the key. Servers pass the real endpoint instead. */
const BROWSER_HERMES: HermesOptions = { baseUrl: "/api/pyth" };

/** The seed is opt-in per browser: a script sets this flag, a person testing by hand gets the real passkey. */
export const E2E_FLAG = "yotrade.e2e";

function e2eRequested(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(E2E_FLAG) === "1";
  } catch {
    return false;
  }
}

/** How often the fallback re-measures its transports. Every tab pings each one this often, so not too often. */
const RANK_INTERVAL_MS = 30_000;

/**
 * Alchemy first when a key is configured, never alone: a rate-limited or failing Alchemy falls through to the public
 * RPC on the same request, and ranking moves whichever keeps failing to the back.
 */
export function appTransport(env: PublicEnv) {
  const rpc = http(env.NEXT_PUBLIC_RPC_URL);
  if (!env.NEXT_PUBLIC_ALCHEMY_API_KEY) {
    return rpc;
  }
  return fallback([alchemyTransport(env.NEXT_PUBLIC_ALCHEMY_API_KEY, monadTestnet.id), rpc], {
    rank: { interval: RANK_INTERVAL_MS },
  });
}

/** Every integration the app talks to, wired once. */
export function createAppRuntime(env: PublicEnv, hermesOptions: HermesOptions = BROWSER_HERMES) {
  const transport = appTransport(env);

  const source = e2eSource(env.NEXT_PUBLIC_E2E_PRF_SEED);

  return createRuntime({
    chain: monadTestnet,
    transport,
    plugins: [
      kuru(),
      tournament(),
      perps({ hermes: hermes(hermesOptions) }),
      mera({
        rp: { id: env.NEXT_PUBLIC_RP_ID, name: "YoTrade" },
        // Servers have no tab. The store is only touched inside `resume`, `signIn`, `register` and `forget`.
        session: tabSession,
        ...(source ? { source } : {}),
      }),
    ],
  });
}

export type AppRuntime = ReturnType<typeof createAppRuntime>;
