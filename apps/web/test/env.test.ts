import { describe, expect, test } from "bun:test";

import { parsePublicEnv } from "../src/lib/env.ts";
import { createAppRuntime } from "../src/lib/runtime.ts";

describe("parsePublicEnv", () => {
  test("falls back to local development defaults", () => {
    expect(parsePublicEnv({})).toEqual({
      NEXT_PUBLIC_RP_ID: "localhost",
      NEXT_PUBLIC_RPC_URL: "https://testnet-rpc.monad.xyz",
    });
  });

  test("names the offending variable instead of failing later", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_RPC_URL: "not a url" })).toThrow(
      /NEXT_PUBLIC_RPC_URL/,
    );
    expect(() => parsePublicEnv({ NEXT_PUBLIC_RP_ID: "" })).toThrow(/NEXT_PUBLIC_RP_ID/);
  });
});

describe("createAppRuntime", () => {
  test("wires every plugin on Monad testnet", () => {
    const runtime = createAppRuntime(parsePublicEnv({}));

    expect(runtime.chain.id).toBe(10_143);
    expect(typeof runtime.kuru.portfolio).toBe("function");
    expect(typeof runtime.tournament.latest).toBe("function");
    expect(typeof runtime.mera.signIn).toBe("function");
  });

  test("switches to Alchemy when a key is configured", () => {
    const runtime = createAppRuntime(parsePublicEnv({ NEXT_PUBLIC_ALCHEMY_API_KEY: "key" }));
    expect(runtime.publicClient.transport.url).toBe("https://monad-testnet.g.alchemy.com/v2/key");
  });
});
