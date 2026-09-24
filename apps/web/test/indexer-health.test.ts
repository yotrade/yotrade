import { describe, expect, test } from "bun:test";

import { indexerHealth } from "../src/server/indexer-health.ts";

describe("indexerHealth", () => {
  test("down when it does not answer, stale when it falls behind", () => {
    expect(indexerHealth(null, 100n)).toEqual({ ok: false });
    expect(indexerHealth(99n, 100n)).toEqual({ ok: true, lag: "1" });
    expect(indexerHealth(100n, 2_000n)).toEqual({ ok: false, lag: "1900" });
    // A read from a node a block ahead of ours is not negative lag.
    expect(indexerHealth(101n, 100n)).toEqual({ ok: true, lag: "0" });
  });
});
