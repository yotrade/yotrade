import { describe, expect, test } from "bun:test";

import { resultCard } from "@/lib/result-card.ts";

describe("resultCard", () => {
  test("a podium place with a prize", () => {
    expect(resultCard({ rank: 1, of: 12, roiPpm: 42_000, prize: 50_000_000n })).toEqual({
      place: "#1",
      line: "On the podium",
      facts: [
        ["Return", "+4.20%"],
        ["Traders", "12"],
        ["Won", "$50.00"],
      ],
    });
  });

  test("a place off the podium, no prize line", () => {
    const card = resultCard({ rank: 7, of: 12, roiPpm: -15_000, prize: 0n });
    expect(card.line).toBe("Finished #7 of 12");
    expect(card.facts).toEqual([
      ["Return", "−1.50%"],
      ["Traders", "12"],
    ]);
  });
});
