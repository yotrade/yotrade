import { describe, expect, test } from "bun:test";

import { createRuntime } from "@yotrade/core/plugin";
import { custom, encodeAbiParameters, hashMessage, keccak256, recoverAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

import { tournament } from "../src/plugin.ts";

const MANAGER = "0xe60aFf1991d9D93e6093da5c813A63B746159D10";
const ALICE = "0x00000000000000000000000000000000000a11ce";

/** The contract's digest, recomputed here so the test does not depend on a node. */
const digest = hashMessage({
  raw: keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
      ],
      ["YoTrade invite", BigInt(monadTestnet.id), MANAGER, 7n, ALICE],
    ),
  ),
});

describe("invite proof", () => {
  test("is the code's signature over the contract digest, laid out as three words", async () => {
    const code = generatePrivateKey();
    const runtime = createRuntime({
      chain: monadTestnet,
      // A fake node. Reads go through Multicall3, so the answer is one successful `aggregate3` result.
      transport: custom({
        request: () =>
          Promise.resolve(
            encodeAbiParameters(
              [{ type: "tuple[]", components: [{ type: "bool" }, { type: "bytes" }] }],
              [[[true, digest]]],
            ),
          ),
      }),
      plugins: [tournament({ address: MANAGER })],
    });
    const [r, s, v] = await runtime.tournament.inviteProof(code, 7n, ALICE);
    expect(r).toMatch(/^0x[0-9a-f]{64}$/);
    expect(s).toMatch(/^0x[0-9a-f]{64}$/);
    expect([27n, 28n]).toContain(BigInt(v ?? "0x0"));
    const recovered = await recoverAddress({
      hash: digest,
      signature: { r: r as `0x${string}`, s: s as `0x${string}`, v: BigInt(v ?? "0x0") },
    });
    expect(recovered).toBe(privateKeyToAccount(code).address);
  });
});
