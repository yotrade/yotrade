import { describe, expect, test } from "bun:test";

import { parsePublicEnv } from "../src/lib/env.ts";
import { createAppRuntime, E2E_FLAG } from "../src/lib/runtime.ts";

describe("parsePublicEnv", () => {
  test("falls back to local development defaults", () => {
    expect(parsePublicEnv({})).toEqual({
      NEXT_PUBLIC_RP_ID: "localhost",
      NEXT_PUBLIC_RPC_URL: "https://testnet-rpc.monad.xyz",
      NEXT_PUBLIC_INDEXER_URL: "https://indexer.dev.hyperindex.xyz/ef7fbaa/v1/graphql",
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

  test("a seed gives one stable account, but only in a browser that opted in", async () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_E2E_PRF_SEED: `0x${"11".repeat(32)}` });
    // No flag: the real passkey path, which has no WebAuthn here and so cannot sign in.
    await expect(createAppRuntime(env).mera.signIn()).rejects.toThrow();

    const storage = { getItem: (key: string) => (key === E2E_FLAG ? "1" : null) };
    Object.assign(globalThis, { localStorage: storage });
    try {
      const first = await createAppRuntime(env).mera.signIn();
      const second = await createAppRuntime(env).mera.register({ name: "x", displayName: "x" });
      expect(first.wallet.account.address).toBe(second.wallet.account.address);
      expect(first.tournamentWallet(1n).account.address).not.toBe(first.wallet.account.address);
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  test("rejects a seed that is not 32 bytes", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_E2E_PRF_SEED: "0x1234" })).toThrow(
      "NEXT_PUBLIC_E2E_PRF_SEED",
    );
  });
});
