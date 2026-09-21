import { describe, expect, test } from "bun:test";

import { type JoinDeps, JoinError, type JoinStep, runJoin } from "../src/lib/join.ts";

const FAUCET = 10_000_000_000n;

function setup(state: { wallet: bigint; kuru: bigint; joined?: boolean; canClaim?: boolean }) {
  const calls: string[] = [];
  const steps: JoinStep[] = [];
  const deps: JoinDeps = {
    hasJoined: () => Promise.resolve(state.joined ?? false),
    fundGas: () => Promise.resolve(void calls.push("gas")),
    walletUsdc: () => Promise.resolve(state.wallet),
    kuruUsdc: () => Promise.resolve(state.kuru),
    canClaimFaucet: () => Promise.resolve(state.canClaim ?? true),
    claimFaucet: () => {
      calls.push("claim");
      state.wallet += FAUCET;
      return Promise.resolve();
    },
    deposit: (amount) => {
      calls.push(`deposit:${amount}`);
      state.kuru += amount;
      state.wallet -= amount;
      return Promise.resolve();
    },
    join: () => Promise.resolve(void calls.push("join")),
  };
  return {
    deps,
    calls,
    steps,
    run: (capital: bigint) => runJoin(deps, capital, (s) => steps.push(s)),
  };
}

describe("runJoin", () => {
  test("a fresh account goes through every step and deposits everything it received", async () => {
    const { run, calls, steps } = setup({ wallet: 0n, kuru: 0n });
    await run(500_000_000n);
    expect(calls).toEqual(["gas", "claim", `deposit:${FAUCET}`, "join"]);
    expect(steps).toEqual(["gas", "faucet", "deposit", "join"]);
  });

  test("resumes after a failed join without claiming or depositing twice", async () => {
    const { run, calls } = setup({ wallet: 0n, kuru: FAUCET });
    await run(500_000_000n);
    expect(calls).toEqual(["gas", "join"]);
  });

  test("does nothing for an account that already joined", async () => {
    const { run, calls } = setup({ wallet: 0n, kuru: 0n, joined: true });
    await run(500_000_000n);
    expect(calls).toEqual([]);
  });

  test("stops with a clear message when the faucet is cooling down", async () => {
    const { run, calls } = setup({ wallet: 0n, kuru: 0n, canClaim: false });
    await expect(run(500_000_000n)).rejects.toBeInstanceOf(JoinError);
    expect(calls).toEqual(["gas"]);
  });

  test("a free tournament still creates the Kuru account", async () => {
    const { run, calls } = setup({ wallet: 0n, kuru: 0n });
    await run(0n);
    expect(calls).toEqual(["gas", "claim", `deposit:${FAUCET}`, "join"]);
  });

  test("refuses a tournament the faucet cannot fund", async () => {
    const { run, calls } = setup({ wallet: 0n, kuru: 0n });
    await expect(run(FAUCET + 1n)).rejects.toThrow("starting capital");
    expect(calls).toEqual(["gas", "claim"]);
  });
});
