import { describe, expect, test } from "bun:test";

import { countdown, formatUsdc, timeUntil, tournamentName } from "../src/lib/format.ts";

describe("format", () => {
  test("formats raw USDC units", () => {
    expect(formatUsdc(1_234_500_000n)).toBe("1,234.50");
    expect(formatUsdc(0n)).toBe("0.00");
  });

  test("reads the name from metadata and falls back on anything unexpected", () => {
    expect(tournamentName(1n, 'data:application/json,{"name":"Genesis Cup"}')).toBe("Genesis Cup");
    expect(tournamentName(2n, "https://evil.example/meta.json")).toBe("Tournament #2");
    expect(tournamentName(3n, "data:application/json,{not json")).toBe("Tournament #3");
    expect(tournamentName(4n, 'data:application/json,{"name":42}')).toBe("Tournament #4");
    expect(tournamentName(5n, `data:application/json,{"name":"${"x".repeat(200)}"}`)).toHaveLength(
      60,
    );
  });

  test("shows the two most significant units of a countdown", () => {
    expect(timeUntil(90_061n, 0n)).toBe("1d 1h");
    expect(timeUntil(125n, 0n)).toBe("2m 5s");
    expect(timeUntil(5n, 10n)).toBe("");
    expect(countdown("live", { startTime: 0n, endTime: 3_600n }, 0n)).toBe("1h left");
    expect(countdown("claimable", { startTime: 0n, endTime: 1n }, 5n)).toBe("");
  });
});
