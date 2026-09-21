import { describe, expect, test } from "bun:test";

import { isEmpty, parseProfile } from "@/lib/profile.ts";
import { traderName } from "@/lib/use-profiles.ts";

const ALICE = "0x00000000000000000000000000000000000a11ce";

describe("profile", () => {
  test("trims the name and keeps a known avatar", () => {
    expect(parseProfile("  Fajar  ", 3)).toEqual({ name: "Fajar", avatar: 3 });
  });

  test("an unknown avatar becomes none instead of a broken image", () => {
    expect(parseProfile("Fajar", 99)).toEqual({ name: "Fajar", avatar: 0 });
  });

  test("the limit is 32 bytes, so multi-byte names run out sooner", () => {
    expect(parseProfile("a".repeat(32), 0)).toEqual({ name: "a".repeat(32), avatar: 0 });
    expect(parseProfile("a".repeat(33), 0)).toEqual({ error: "That name is too long" });
    expect(parseProfile("é".repeat(17), 0)).toEqual({ error: "That name is too long" });
  });

  test("empty means nothing worth a transaction", () => {
    expect(isEmpty({ name: "", avatar: 0 })).toBe(true);
    expect(isEmpty({ name: "", avatar: 2 })).toBe(false);
  });

  test("a trader is You, then their name, then a short address", () => {
    expect(traderName(ALICE, { name: "Alice", avatar: 1 }, true)).toBe("You");
    expect(traderName(ALICE, { name: "Alice", avatar: 1 }, false)).toBe("Alice");
    expect(traderName(ALICE, { name: "", avatar: 1 }, false)).toBe("0x0000…11ce");
    expect(traderName(ALICE, undefined, false)).toBe("0x0000…11ce");
  });
});
