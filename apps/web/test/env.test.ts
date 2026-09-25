import { describe, expect, test } from "bun:test";

import { monadTestnet } from "viem/chains";

import { parsePublicEnv } from "../src/lib/env.ts";
import { appTransport, createAppRuntime, E2E_FLAG } from "../src/lib/runtime.ts";

describe("parsePublicEnv", () => {
  test("falls back to local development defaults", () => {
    expect(parsePublicEnv({})).toEqual({
      NEXT_PUBLIC_RP_ID: "localhost",
      NEXT_PUBLIC_RPC_URL: "https://testnet-rpc.monad.xyz",
      NEXT_PUBLIC_INDEXER_URL: "https://indexer.dev.hyperindex.xyz/2d1cdb5/v1/graphql",
    });
  });

  test("names the offending variable instead of failing later", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_RPC_URL: "not a url" })).toThrow(
      /NEXT_PUBLIC_RPC_URL/,
    );
    expect(() => parsePublicEnv({ NEXT_PUBLIC_INDEXER_URL: "nope" })).toThrow(
      /NEXT_PUBLIC_INDEXER_URL/,
    );
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

  test("puts Alchemy first when a key is configured, with the public RPC behind it", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_ALCHEMY_API_KEY: "key" });
    const transport = appTransport(env)({ chain: monadTestnet });
    expect(transport.config.type).toBe("fallback");
    const urls = (transport.value as { transports: { value?: { url?: string } }[] }).transports.map(
      (inner) => inner.value?.url,
    );
    expect(urls).toEqual(["https://monad-testnet.g.alchemy.com/v2/key", env.NEXT_PUBLIC_RPC_URL]);
  });

  test("uses the public RPC alone without a key", () => {
    const transport = appTransport(parsePublicEnv({}))({ chain: monadTestnet });
    expect(transport.config.type).toBe("http");
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

test("an empty optional variable, as a container passes it, counts as unset", () => {
  expect(
    parsePublicEnv({ NEXT_PUBLIC_RP_ID: "yotrade.xyz", NEXT_PUBLIC_ALCHEMY_API_KEY: "" })
      .NEXT_PUBLIC_ALCHEMY_API_KEY,
  ).toBeUndefined();
});
