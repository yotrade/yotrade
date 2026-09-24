import { describe, expect, test } from "bun:test";

import { rankLabel, rankText, returnTone, timeText } from "@/lib/game-status.ts";

describe("game status", () => {
  test("a rank only means something once you traded", () => {
    expect(rankText(undefined)).toBe("—");
    expect(rankText({ rank: 9, fills: 0 })).toBe("—");
    expect(rankText({ rank: 3, fills: 2 })).toBe("#3");
    expect(rankLabel({ rank: 9, fills: 0 }, 15)).toBe("Trade to rank");
    expect(rankLabel({ rank: 3, fills: 2 }, 15)).toBe("Rank of 15");
    expect(rankLabel(undefined, 0)).toBe("Rank");
  });

  test("the clock follows the phase", () => {
    const schedule = { startTime: 1_000n, endTime: 4_600n };
    expect(timeText("live", schedule, 1_000n)).toBe("1:00:00");
    expect(timeText("upcoming", schedule, 700n)).toBe("in 5:00");
    expect(timeText("claimable", schedule, 9_000n)).toBe("Ended");
    expect(timeText("live", null, 0n)).toBe("—");
  });

  test("return colour", () => {
    expect(returnTone(null)).toBe("");
    expect(returnTone(12)).toContain("7ce7a3");
    expect(returnTone(-1)).toContain("ff8a8a");
  });
});
