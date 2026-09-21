import { describe, expect, test } from "bun:test";

import { createIndexer } from "../src/lib/indexer.ts";

// Shape captured from the live Envio deployment.
const GENESIS = {
  id: "1",
  organizer: "0x3b4f0135465d444a5bd06ab90fc59b73916c85f5",
  venue: "0xadefe39b43673641e94ce99613c54266af2490e6",
  prizePool: "100000000",
  startingCapital: "500000000",
  startTime: "1789987406",
  endTime: "1790592206",
  claimableAt: "0",
  maxParticipants: 50,
  participantCount: 1,
  allowlisted: false,
  prizeSplitBps: [5000, 3000, 2000],
  metadataURI: 'data:application/json,{"name":"Genesis Cup"}',
  status: "OPEN",
  winners: [],
};

const respond =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("createIndexer", () => {
  test("turns indexer strings into bigints, checksummed addresses and contract statuses", async () => {
    const indexer = createIndexer(
      "https://indexer.test",
      respond({ data: { tournaments: [GENESIS] } }),
    );
    const [tournament] = await indexer.tournaments();
    expect(tournament?.prizePool).toBe(100_000_000n);
    expect(tournament?.status).toBe("open");
    expect(tournament?.organizer).toBe("0x3B4f0135465d444a5bD06Ab90fC59B73916C85F5");
  });

  test("rejects a response that does not match the schema instead of rendering it", async () => {
    const broken = { ...GENESIS, prizePool: "-1" };
    const indexer = createIndexer(
      "https://indexer.test",
      respond({ data: { tournaments: [broken] } }),
    );
    await expect(indexer.tournaments()).rejects.toThrow();
  });

  test("surfaces GraphQL and HTTP errors", async () => {
    const graphql = createIndexer(
      "https://indexer.test",
      respond({ errors: [{ message: "boom" }] }),
    );
    await expect(graphql.tournaments()).rejects.toThrow("boom");
    const http = createIndexer("https://indexer.test", respond({}, 502));
    await expect(http.tournament(1n)).rejects.toThrow("502");
  });

  test("an unknown tournament is null, not an error", async () => {
    const indexer = createIndexer("https://indexer.test", respond({ data: { tournament: [] } }));
    expect(await indexer.tournament(99n)).toBeNull();
  });
});
