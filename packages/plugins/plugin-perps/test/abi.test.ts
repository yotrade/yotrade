import { describe, expect, test } from "bun:test";

import { renderAbi } from "../scripts/generate-abi.ts";
import { perpsEngineAbi } from "../src/generated/abi.ts";

describe("generated ABI", () => {
  test("matches the contract source; run `bun run generate` after changing PerpsEngine", async () => {
    const committed = await Bun.file(new URL("../src/generated/abi.ts", import.meta.url)).text();
    expect(committed).toBe(await renderAbi());
  });

  test("exposes what the client calls", () => {
    const functions = new Set<string>(
      perpsEngineAbi.filter((item) => item.type === "function").map((item) => item.name),
    );
    for (const name of ["trade", "liquidate", "settle", "accountOf", "positionOf"]) {
      expect(functions.has(name)).toBe(true);
    }
  });
});
