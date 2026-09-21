import { describe, expect, test } from "bun:test";

import { parseEther } from "viem";

import { createDripper, DRIP_AMOUNT } from "../src/server/drip.ts";

const ALICE = "0x00000000000000000000000000000000000000a1";
const HASH = "0x01" as const;

function setup(balance = 0n) {
  const sent: [string, bigint][] = [];
  let time = 1_000_000;
  const drip = createDripper({
    getBalance: () => Promise.resolve(balance),
    send: (to, value) => {
      sent.push([to, value]);
      return Promise.resolve(HASH);
    },
    now: () => time,
  });
  return { drip, sent, advance: (ms: number) => (time += ms) };
}

describe("createDripper", () => {
  test("funds an empty account once, then makes it wait", async () => {
    const { drip, sent, advance } = setup();
    expect(await drip(ALICE, "ip")).toEqual({ status: "funded", hash: HASH });
    expect((await drip(ALICE, "ip")).status).toBe("limited");
    advance(10 * 60_000);
    expect((await drip(ALICE, "ip")).status).toBe("funded");
    expect(sent).toEqual([
      [ALICE, DRIP_AMOUNT],
      [ALICE, DRIP_AMOUNT],
    ]);
  });

  test("never pays an account that can already trade", async () => {
    const { drip, sent } = setup(parseEther("0.1"));
    expect(await drip(ALICE, "ip")).toEqual({ status: "sufficient" });
    expect(sent).toHaveLength(0);
  });

  test("caps fresh addresses from one IP", async () => {
    const { drip } = setup();
    const address = (index: number) => `0x${index.toString(16).padStart(40, "0")}` as const;
    for (let index = 1; index <= 5; index++) {
      expect((await drip(address(index), "ip")).status).toBe("funded");
    }
    expect((await drip(address(6), "ip")).status).toBe("limited");
    expect((await drip(address(6), "other-ip")).status).toBe("funded");
  });

  test("a failed send still counts against the limits", async () => {
    let time = 0;
    const drip = createDripper({
      getBalance: () => Promise.resolve(0n),
      send: () => Promise.reject(new Error("rpc down")),
      now: () => time++,
    });
    await expect(drip(ALICE, "ip")).rejects.toThrow("rpc down");
    expect((await drip(ALICE, "ip")).status).toBe("limited");
  });
});
