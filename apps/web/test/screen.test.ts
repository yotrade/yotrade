import { describe, expect, test } from "bun:test";

import { clock, joinUrl, podiumOf } from "@/lib/screen.ts";

describe("host screen", () => {
  test("the countdown reads from the back of the room", () => {
    expect(clock(0n)).toBe("0:00");
    expect(clock(-5n)).toBe("0:00");
    expect(clock(247n)).toBe("4:07");
    expect(clock(3_750n)).toBe("1:02:30");
    expect(clock(2n * 86_400n + 4n * 3_600n + 59n)).toBe("2d 4h");
  });

  test("phones join by code, or by the invite link when the room is private", () => {
    expect(joinUrl("https://app.yotrade.xyz", "KHB5UF", null)).toBe(
      "https://app.yotrade.xyz/r/KHB5UF",
    );
    expect(
      joinUrl("https://app.yotrade.xyz", "KHB5UF", "https://app.yotrade.xyz/t/9#invite=0xab"),
    ).toBe("https://app.yotrade.xyz/t/9#invite=0xab");
  });
});

describe("podiumOf", () => {
  const a = "0x00000000000000000000000000000000000000aa" as const;
  const b = "0x00000000000000000000000000000000000000bb" as const;
  const c = "0x00000000000000000000000000000000000000cc" as const;
  const rows = [
    { participant: a, roiPpm: 500 },
    { participant: b, roiPpm: 100 },
  ];

  test("the top of the board until results are posted", () => {
    expect(podiumOf(rows, [])).toEqual(rows);
  });

  test("the posted winners after, in their order, with a return when the board has one", () => {
    expect(podiumOf(rows, [b, c])).toEqual([
      { participant: b, roiPpm: 100 },
      { participant: c, roiPpm: null },
    ]);
  });
});
