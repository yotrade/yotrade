import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

const CHAIN = 10143;
const ORGANIZER = "0x00000000000000000000000000000000000000a1";
const ALICE = "0x00000000000000000000000000000000000000b1";
const BOB = "0x00000000000000000000000000000000000000b2";
const CAROL = "0x00000000000000000000000000000000000000b3";
const USDC = "0xee0722ead54f1b4fe97be399be43bc0226a6f97e";
const VENUE = "0xadefe39b43673641e94ce99613c54266af2490e6";
const ZERO_ROOT = `0x${"0".repeat(64)}`;
const POOL = 1_000_000_000n; // 1,000 USDC
const CAPITAL = 10_000_000_000n;

type Indexer = ReturnType<typeof createTestIndexer>;

const created = (id: bigint, split: bigint[] = [5000n, 3000n, 2000n]) => ({
  contract: "TournamentManager" as const,
  event: "TournamentCreated" as const,
  params: {
    id,
    organizer: ORGANIZER,
    config: [
      USDC,
      USDC,
      VENUE,
      POOL,
      CAPITAL,
      1_000n,
      2_000n,
      50n,
      ZERO_ROOT,
      split,
      "ipfs://t",
    ] as const,
  },
});

const joined = (id: bigint, participant: string, capitalAtJoin = CAPITAL) => ({
  contract: "TournamentManager" as const,
  event: "Joined" as const,
  params: { id, participant, tradingAccount: `${participant.slice(0, -2)}ff`, capitalAtJoin },
});

const resultsPosted = (id: bigint, winners: string[]) => ({
  contract: "TournamentManager" as const,
  event: "ResultsPosted" as const,
  params: { id, winners, claimableAt: 5_600n },
});

const run = (indexer: Indexer, simulate: unknown[]) =>
  indexer.process({ chains: { [CHAIN]: { simulate } } } as Parameters<Indexer["process"]>[0]);

describe("tournament lifecycle", () => {
  it("indexes a tournament with its config, entries and global stats", async () => {
    const indexer = createTestIndexer();
    await run(indexer, [created(1n), joined(1n, ALICE), joined(1n, BOB, CAPITAL + 1n)]);

    const tournament = await indexer.Tournament.getOrThrow("1");
    expect(tournament).toMatchObject({
      organizer: ORGANIZER,
      venue: VENUE,
      prizePool: POOL,
      startingCapital: CAPITAL,
      maxParticipants: 50,
      allowlisted: false,
      prizeSplitBps: [5000, 3000, 2000],
      status: "OPEN",
      participantCount: 2,
    });

    // The scorer needs the real capital at join, not the tournament minimum.
    expect(await indexer.Entry.getOrThrow(`1-${BOB}`)).toMatchObject({
      tournament_id: "1",
      participant_id: BOB,
      capitalAtJoin: CAPITAL + 1n,
      rank: undefined,
      claimed: false,
    });
    expect(await indexer.Stats.getOrThrow("global")).toMatchObject({
      tournaments: 1,
      entries: 2,
      traders: 2,
      prizesEscrowed: POOL,
    });
  });

  it("ranks winners, computes prizes like the contract and tracks claims", async () => {
    const indexer = createTestIndexer();
    await run(indexer, [
      created(1n),
      joined(1n, ALICE),
      joined(1n, BOB),
      joined(1n, CAROL),
      resultsPosted(1n, [BOB, ALICE]),
      {
        contract: "TournamentManager",
        event: "PrizeClaimed",
        params: { id: 1n, winner: BOB, rank: 1n, amount: 500_000_000n },
      },
    ]);

    expect(await indexer.Entry.getOrThrow(`1-${BOB}`)).toMatchObject({
      rank: 1,
      prize: 500_000_000n,
      claimed: true,
    });
    expect(await indexer.Entry.getOrThrow(`1-${ALICE}`)).toMatchObject({
      rank: 2,
      prize: 300_000_000n,
      claimed: false,
    });
    expect(await indexer.Entry.getOrThrow(`1-${CAROL}`)).toMatchObject({
      rank: undefined,
      prize: 0n,
    });

    expect(await indexer.Trader.getOrThrow(BOB)).toMatchObject({
      podiums: 1,
      wins: 1,
      totalPrize: 500_000_000n,
    });
    expect(await indexer.Trader.getOrThrow(ALICE)).toMatchObject({
      podiums: 1,
      wins: 0,
      totalPrize: 0n,
    });
    expect(await indexer.Tournament.getOrThrow("1")).toMatchObject({
      status: "RESULTS_POSTED",
      winners: [BOB, ALICE],
      claimableAt: 5_600n,
      prizesClaimed: 500_000_000n,
    });
    expect((await indexer.Stats.getOrThrow("global")).prizesClaimed).toBe(500_000_000n);
  });

  it("voiding results reverses ranks and podium counters so a repost is counted once", async () => {
    const indexer = createTestIndexer();
    await run(indexer, [
      created(1n),
      joined(1n, ALICE),
      joined(1n, BOB),
      resultsPosted(1n, [BOB, ALICE]),
      { contract: "TournamentManager", event: "ResultsVoided", params: { id: 1n } },
    ]);

    expect(await indexer.Tournament.getOrThrow("1")).toMatchObject({
      status: "OPEN",
      winners: [],
      claimableAt: 0n,
    });
    expect(await indexer.Entry.getOrThrow(`1-${BOB}`)).toMatchObject({
      rank: undefined,
      prize: 0n,
    });
    expect(await indexer.Trader.getOrThrow(BOB)).toMatchObject({ podiums: 0, wins: 0 });

    await run(indexer, [resultsPosted(1n, [ALICE, BOB])]);

    expect(await indexer.Trader.getOrThrow(ALICE)).toMatchObject({ podiums: 1, wins: 1 });
    expect(await indexer.Trader.getOrThrow(BOB)).toMatchObject({ podiums: 1, wins: 0 });
    expect(await indexer.Entry.getOrThrow(`1-${ALICE}`)).toMatchObject({
      rank: 1,
      prize: 500_000_000n,
    });
  });

  it("tracks what goes back to the organizer on cancel and on sweep", async () => {
    const indexer = createTestIndexer();
    await run(indexer, [
      created(1n),
      {
        contract: "TournamentManager",
        event: "TournamentCancelled",
        params: { id: 1n, refunded: POOL },
      },
      created(2n),
      joined(2n, ALICE),
      resultsPosted(2n, [ALICE]),
      {
        contract: "TournamentManager",
        event: "RemainderSwept",
        params: { id: 2n, amount: 500_000_000n },
      },
    ]);

    expect(await indexer.Tournament.getOrThrow("1")).toMatchObject({
      status: "CANCELLED",
      returnedToOrganizer: POOL,
    });
    expect(await indexer.Tournament.getOrThrow("2")).toMatchObject({
      status: "RESULTS_POSTED",
      returnedToOrganizer: 500_000_000n,
    });
  });

  it("counts a trader once across tournaments and flags allowlisted tournaments", async () => {
    const indexer = createTestIndexer();
    const gated = created(2n);
    const allowlisted = {
      ...gated,
      params: {
        ...gated.params,
        config: [
          ...gated.params.config.slice(0, 8),
          `0x${"ab".repeat(32)}`,
          ...gated.params.config.slice(9),
        ],
      },
    };
    await run(indexer, [created(1n), allowlisted, joined(1n, ALICE), joined(2n, ALICE)]);

    expect((await indexer.Tournament.getOrThrow("2")).allowlisted).toBe(true);
    expect(await indexer.Trader.getOrThrow(ALICE)).toMatchObject({ tournamentsJoined: 2 });
    expect(await indexer.Stats.getOrThrow("global")).toMatchObject({ entries: 2, traders: 1 });
  });
});
