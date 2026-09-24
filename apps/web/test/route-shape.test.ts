import { describe, expect, test } from "bun:test";

import { roomCode } from "@/lib/room-code.ts";
import { isPossibleRoute } from "@/lib/route-shape.ts";

describe("isPossibleRoute", () => {
  test("links that can point at something pass", () => {
    for (const path of [
      "/",
      "/t/1",
      "/t/21/trade",
      "/t/1/trade/xaut0",
      "/t/21/trade/btc",
      "/t/9/screen",
    ]) {
      expect(isPossibleRoute(path)).toBe(true);
    }
    expect(isPossibleRoute(`/r/${roomCode(1n)}`)).toBe(true);
  });

  test("malformed ids, bad room codes and unknown markets do not", () => {
    for (const path of ["/t/abc", "/t/0", "/t/01", "/t/1/trade/doge", "/r/ZZZZZZ", "/r/"]) {
      expect(isPossibleRoute(path)).toBe(false);
    }
  });
});
