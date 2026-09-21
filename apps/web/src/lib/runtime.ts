import { http } from "viem";
import { monadTestnet } from "viem/chains";

import { createRuntime } from "@yotrade/core/plugin";
import { alchemyTransport } from "@yotrade/plugin-alchemy/transport";
import { kuru } from "@yotrade/plugin-kuru/plugin";
import { mera } from "@yotrade/plugin-mera/plugin";
import { tournament } from "@yotrade/plugin-tournament/plugin";

import type { PublicEnv } from "./env.ts";

/** Every integration the app talks to, wired once. Alchemy is used when a key is configured. */
export function createAppRuntime(env: PublicEnv) {
  const transport = env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? alchemyTransport(env.NEXT_PUBLIC_ALCHEMY_API_KEY, monadTestnet.id)
    : http(env.NEXT_PUBLIC_RPC_URL);

  return createRuntime({
    chain: monadTestnet,
    transport,
    plugins: [kuru(), tournament(), mera({ rp: { id: env.NEXT_PUBLIC_RP_ID, name: "YoTrade" } })],
  });
}

export type AppRuntime = ReturnType<typeof createAppRuntime>;
