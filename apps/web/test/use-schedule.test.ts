import { describe, expect, test } from "bun:test";

import { withChainSchedule } from "@/lib/use-schedule.ts";

describe("withChainSchedule", () => {
  const indexed = { id: 7n, startTime: 1_000n, endTime: 2_000n };

  test("the chain's schedule wins once it answers, the rest stays as indexed", () => {
    expect(withChainSchedule(indexed, { startTime: 400n, endTime: 1_400n })).toEqual({
      id: 7n,
      startTime: 400n,
      endTime: 1_400n,
    });
  });

  test("no answer yet, or no change, returns the indexed object itself", () => {
    expect(withChainSchedule(indexed, undefined)).toBe(indexed);
    expect(withChainSchedule(indexed, { startTime: 1_000n, endTime: 2_000n })).toBe(indexed);
  });
});
