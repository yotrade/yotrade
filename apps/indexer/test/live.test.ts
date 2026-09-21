import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

/** Reads real events through HyperSync. Run with `bun run test:live` (needs ENVIO_API_TOKEN). */
const live = process.env["INDEXER_LIVE"] === "1" ? describe : describe.skip;

live("indexer against Monad testnet", () => {
  it("indexes the first tournament and its first entry from chain data", async () => {
    const indexer = createTestIndexer();
    // Auto-exit mode: each call processes the next block that contains one of our events.
    await indexer.process({ chains: { 10143: {} } });
    await indexer.process({ chains: { 10143: {} } });

    const tournament = await indexer.Tournament.getOrThrow("1");
    expect(tournament.venue).toBe("0xadefe39b43673641e94ce99613c54266af2490e6");
    expect(tournament.prizeSplitBps).toEqual([5000, 3000, 2000]);
    expect(tournament.participantCount).toBe(1);

    const [entry] = await indexer.Entry.getAll();
    expect(entry?.tournament_id).toBe("1");
    expect(entry?.capitalAtJoin).toBeGreaterThanOrEqual(tournament.startingCapital);
  }, 120_000);
});
