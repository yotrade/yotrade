import { describe, expect, test } from "bun:test";

import { phaseAt, type Schedule, toStatus } from "../src/phase.ts";

const open: Schedule = { status: "open", startTime: 1_000n, endTime: 2_000n, claimableAt: 0n };
const posted: Schedule = { ...open, status: "resultsPosted", claimableAt: 5_600n };

describe("phaseAt", () => {
  test("walks an open tournament through upcoming, live and scoring", () => {
    expect(phaseAt(open, 999n)).toBe("upcoming");
    expect(phaseAt(open, 1_000n)).toBe("live");
    expect(phaseAt(open, 1_999n)).toBe("live");
    expect(phaseAt(open, 2_000n)).toBe("scoring");
  });

  test("keeps prizes locked until the dispute window has passed", () => {
    expect(phaseAt(posted, 5_599n)).toBe("dispute");
    expect(phaseAt(posted, 5_600n)).toBe("claimable");
  });

  test("reports terminal and unknown states regardless of the clock", () => {
    expect(phaseAt({ ...open, status: "cancelled" }, 1_500n)).toBe("cancelled");
    expect(phaseAt({ ...open, status: "none" }, 1_500n)).toBe("unknown");
  });
});

describe("toStatus", () => {
  test("maps the contract enum in declaration order", () => {
    expect([0, 1, 2, 3].map(toStatus)).toEqual(["none", "open", "resultsPosted", "cancelled"]);
  });

  test("rejects values the contract cannot return", () => {
    expect(() => toStatus(4)).toThrow(RangeError);
  });
});
