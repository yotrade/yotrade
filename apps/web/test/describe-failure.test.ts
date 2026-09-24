import { describe, expect, test } from "bun:test";

import { tournamentManagerAbi } from "@yotrade/plugin-tournament/abi";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
} from "viem";

import { ActionError, describeFailure, isSettled, revertName } from "@/lib/describe-failure.ts";
import { GasError } from "@/lib/fund-gas.ts";

const reverted = (
  errorName: "TournamentFull" | "AlreadyClaimed" | "WrongStatus",
  args: unknown[] = [],
) =>
  new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({
      abi: tournamentManagerAbi,
      functionName: "join",
      data: encodeErrorResult({ abi: tournamentManagerAbi, errorName, args } as never),
    }),
    {
      abi: tournamentManagerAbi,
      functionName: "join",
      args: [1n, "0x0000000000000000000000000000000000000001", []],
    },
  );

describe("describeFailure", () => {
  test("names the contract's reason when the transaction reverted with one", () => {
    expect(revertName(reverted("TournamentFull"))).toBe("TournamentFull");
    expect(describeFailure(reverted("TournamentFull"), "fallback")).toBe(
      "This tournament filled up just now.",
    );
  });

  test("recognises Pyth's own errors by selector, since our ABI does not list them", () => {
    const stale = new ContractFunctionRevertedError({
      abi: tournamentManagerAbi,
      functionName: "join",
      data: "0x19abf40e",
    });
    expect(revertName(stale)).toBe("StalePrice");
    expect(describeFailure(stale, "fallback")).toMatch(/stale/);
    const unknown = new ContractFunctionRevertedError({
      abi: tournamentManagerAbi,
      functionName: "join",
      data: "0xdeadbeef",
    });
    expect(describeFailure(unknown, "fallback")).toBe("fallback");
  });

  test("keeps the app's own diagnosis, and falls back for anything else", () => {
    expect(describeFailure(new GasError("no gas"), "fallback")).toBe("no gas");
    expect(describeFailure(new ActionError("scoring is off"), "fallback")).toBe("scoring is off");
    expect(describeFailure(new Error("socket hang up"), "fallback")).toBe("fallback");
    expect(describeFailure("boom", "fallback")).toBe("fallback");
  });

  test("knows which reverts mean the state has moved on", () => {
    expect(isSettled(reverted("AlreadyClaimed"))).toBe(true);
    expect(isSettled(reverted("WrongStatus", [1]))).toBe(true);
    expect(isSettled(reverted("TournamentFull"))).toBe(false);
    expect(isSettled(new Error("x"))).toBe(false);
  });
});
