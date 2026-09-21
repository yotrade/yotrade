import { describe, expect, test } from "bun:test";

import { custom } from "viem";
import { monadTestnet } from "viem/chains";

import { createRuntime, definePlugin } from "../src/plugin.ts";

/** Answers every RPC call locally so the tests never touch the network. */
const offline = custom({
  request: ({ method }: { method: string }) =>
    Promise.resolve(method === "eth_chainId" ? "0x279f" : "0x2a"),
});

const clock = definePlugin("clock", () => ({ now: () => 1_700_000_000 }));
const blocks = definePlugin("blocks", ({ publicClient }) => ({
  latest: () => publicClient.getBlockNumber(),
}));

describe("createRuntime", () => {
  test("exposes each plugin under its name with its own API", async () => {
    const runtime = createRuntime({
      chain: monadTestnet,
      transport: offline,
      plugins: [clock, blocks],
    });

    expect(runtime.chain.id).toBe(10_143);
    expect(runtime.clock.now()).toBe(1_700_000_000);
    expect(await runtime.blocks.latest()).toBe(42n);
  });

  test("hands every plugin the same public client", () => {
    const seen: unknown[] = [];
    const spy = (name: string) => definePlugin(name, ({ publicClient }) => seen.push(publicClient));

    createRuntime({ chain: monadTestnet, transport: offline, plugins: [spy("a"), spy("b")] });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  test("rejects duplicate and reserved plugin names", () => {
    const build = (names: string[]) => () =>
      createRuntime({
        chain: monadTestnet,
        transport: offline,
        plugins: names.map((name) => definePlugin(name, () => ({}))),
      });

    expect(build(["kuru", "kuru"])).toThrow(/registered twice/);
    expect(build(["publicClient"])).toThrow(/reserved/);
  });

  test("batches reads through Multicall3 to stay under public RPC rate limits", () => {
    const runtime = createRuntime({ chain: monadTestnet, transport: offline, plugins: [] });
    expect(runtime.publicClient.batch?.multicall).toBe(true);
  });

  test("is frozen so call sites cannot swap a plugin at runtime", () => {
    const runtime = createRuntime({ chain: monadTestnet, transport: offline, plugins: [clock] });
    expect(Object.isFrozen(runtime)).toBe(true);
  });
});
