import { describe, expect, test } from "bun:test";

import { createRuntime } from "@yotrade/core/plugin";
import { monadTestnet } from "viem/chains";

import { tournament } from "../src/plugin.ts";

/** Read-only checks against the deployed TournamentManager. Run with `bun run test:live`. */
const live = process.env["TOURNAMENT_LIVE"] === "1" ? describe : describe.skip;

live("tournament plugin on Monad testnet", () => {
  const runtime = createRuntime({ chain: monadTestnet, plugins: [tournament()] });

  test("reads the deployment", async () => {
    const count = await runtime.tournament.count();
    expect(count).toBeGreaterThanOrEqual(0n);
    expect((await runtime.tournament.latest(3)).length).toBe(Number(count < 3n ? count : 3n));
  });

  test("an unknown tournament has status none and no entry", async () => {
    const unknown = await runtime.tournament.get(10n ** 12n);
    expect(unknown.status).toBe("none");
    expect(unknown.phase).toBe("unknown");
    expect(await runtime.tournament.entry(10n ** 12n, runtime.tournament.address)).toBeNull();
  });
});
