import { describe, expect, test } from "bun:test";

import { roomCode, roomId, spaced } from "@/lib/room-code.ts";

describe("room codes", () => {
  test("round-trip for small and large ids, six characters from the unambiguous alphabet", () => {
    for (const id of [1n, 2n, 3n, 16n, 999n, 123_456n, 4_194_303n]) {
      const code = roomCode(id);
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
      expect(roomId(code)).toBe(id);
    }
  });

  test("neighbouring ids do not look alike", () => {
    expect(roomCode(15n).slice(0, 3)).not.toBe(roomCode(16n).slice(0, 3));
  });

  test("a typo is caught instead of opening someone else's room", () => {
    const code = roomCode(16n);
    let caught = 0;
    for (let i = 0; i < 6; i++) {
      const swapped = code.slice(0, i) + (code[i] === "A" ? "B" : "A") + code.slice(i + 1);
      if (roomId(swapped) === null) {
        caught++;
      }
    }
    expect(caught).toBe(6);
  });

  test("forgiving input: case, spaces and dashes are read as meant", () => {
    const code = roomCode(16n);
    expect(roomId(` ${spaced(code).toLowerCase()} `)).toBe(16n);
    expect(roomId(`${code.slice(0, 3)}-${code.slice(3)}`)).toBe(16n);
    expect(roomId("abc")).toBeNull();
    expect(roomId("!!!!!!")).toBeNull();
  });
});
