import { describe, expect, test } from "bun:test";

import { formatBps, parseTicket, roiBps } from "../src/lib/ticket.ts";

describe("parseTicket", () => {
  test("parses against the token's decimals", () => {
    expect(parseTicket("100.5", 6, 1_000_000_000n)).toEqual({ ok: true, amount: 100_500_000n });
    expect(parseTicket(".5", 8, 100_000_000n)).toEqual({ ok: true, amount: 50_000_000n });
  });

  test("rejects what could only revert or mislead", () => {
    for (const bad of ["", ".", "abc", "-1", "1e3", "1,000", "0", "0.0"]) {
      expect(parseTicket(bad, 6, 10n ** 12n).ok).toBe(false);
    }
    expect(parseTicket("0.0000001", 6, 10n ** 12n)).toEqual({
      ok: false,
      reason: "At most 6 decimals",
    });
    expect(parseTicket("2", 6, 1_999_999n)).toEqual({
      ok: false,
      reason: "More than you have available",
    });
  });
});

describe("roi", () => {
  test("is measured in basis points against the capital at join", () => {
    expect(roiBps(10_250_000_000n, 10_000_000_000n)).toBe(250);
    expect(roiBps(9_000_000_000n, 10_000_000_000n)).toBe(-1000);
    expect(roiBps(1n, 0n)).toBeNull();
    expect(formatBps(250)).toBe("+2.50%");
    expect(formatBps(-1000)).toBe("-10.00%");
  });
});
