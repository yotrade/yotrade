import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

const CHAIN = 10143;
const ORGANIZER = "0x00000000000000000000000000000000000000a1";
const ALICE = "0x00000000000000000000000000000000000000b1";
const BOB = "0x00000000000000000000000000000000000000b2";
const ZERO = "0x0000000000000000000000000000000000000000";
const PERPS_VENUE = "0x97167b3126e2dee1fe8920c129bd118eb91e9881";
const BTC = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const ZERO_ROOT = `0x${"0".repeat(64)}`;
const WAD = 10n ** 18n;
const START = 10_000n * WAD;

type Indexer = ReturnType<typeof createTestIndexer>;

const created = (id: bigint) => ({
  contract: "TournamentManager" as const,
  event: "TournamentCreated" as const,
  params: {
    id,
    organizer: ORGANIZER,
    config: [
      ZERO,
      ZERO,
      PERPS_VENUE,
      0n,
      0n,
      1_000n,
      2_000n,
      50n,
      ZERO_ROOT,
      [10_000n],
      "",
    ] as const,
  },
});

/** Futures: the trader is their own trading account. */
const joined = (id: bigint, participant: string) => ({
  contract: "TournamentManager" as const,
  event: "Joined" as const,
  params: { id, participant, tradingAccount: participant, capitalAtJoin: 10_000_000_000n },
});

const traded = (tournamentId: bigint, trader: string, sizeDelta: bigint, balance: bigint) => ({
  contract: "PerpsEngine" as const,
  event: "Traded" as const,
  params: {
    tournamentId,
    trader,
    market: BTC,
    sizeDelta,
    price: 60_000n * WAD,
    realizedPnl: 0n,
    fee: 30n * WAD,
    newSize: sizeDelta,
    balance,
  },
});

/** Simulated blocks start at our contracts' deployment, as the real ones do, and only ever move forward. */
let nextBlock = 64_421_055;
const run = (indexer: Indexer, simulate: unknown[]) =>
  indexer.process({
    chains: {
      [CHAIN]: {
        simulate: simulate.map((item) => {
          const given = item as { block?: object };
          nextBlock += 1;
          return { ...given, block: { number: nextBlock, ...given.block } };
        }),
      },
    },
  } as Parameters<Indexer["process"]>[0]);

describe("futures venue", () => {
  it("records fills on the entry and keeps the last balance", async () => {
    const indexer = createTestIndexer();
    await run(indexer, [
      created(1n),
      joined(1n, ALICE),
      traded(1n, ALICE, WAD, START - 30n * WAD),
      traded(1n, ALICE, -WAD, START - 60n * WAD),
    ]);

    const entry = await indexer.Entry.getOrThrow(`1-${ALICE}`);
    expect(entry).toMatchObject({ perpsFills: 2, perpsBalance: START - 60n * WAD, settled: false });
    // biome-ignore lint/style/useNamingConvention: Envio filter operator
    const fills = await indexer.Fill.getWhere({ entry_id: { _eq: entry.id } });
    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({ market: BTC, price: 60_000n * WAD, trader_id: ALICE });
  });

  it("marks liquidations and settlements", async () => {
    const indexer = createTestIndexer();
    await run(indexer, [
      created(1n),
      joined(1n, ALICE),
      joined(1n, BOB),
      traded(1n, ALICE, 3n * WAD, START - 90n * WAD),
      {
        contract: "PerpsEngine" as const,
        event: "Liquidated" as const,
        params: { tournamentId: 1n, trader: ALICE, liquidator: BOB, balance: 0n },
      },
      traded(1n, BOB, WAD, START - 30n * WAD),
      {
        contract: "PerpsEngine" as const,
        event: "Settled" as const,
        params: { tournamentId: 1n, trader: BOB, balance: START + 970n * WAD },
      },
    ]);

    expect(await indexer.Entry.getOrThrow(`1-${ALICE}`)).toMatchObject({
      liquidated: true,
      perpsBalance: 0n,
    });
    expect(await indexer.Entry.getOrThrow(`1-${BOB}`)).toMatchObject({
      settled: true,
      perpsBalance: START + 970n * WAD,
    });
    // biome-ignore lint/style/useNamingConvention: Envio filter operator
    const liquidations = await indexer.Liquidation.getWhere({ tournament_id: { _eq: "1" } });
    expect(liquidations).toHaveLength(1);
    expect(liquidations[0]).toMatchObject({ liquidator: BOB, balance: 0n });
  });

  it("tracks which feeds are markets", async () => {
    const indexer = createTestIndexer();
    const update = (enabled: boolean) => ({
      contract: "PerpsEngine" as const,
      event: "MarketUpdated" as const,
      params: { market: BTC, enabled },
    });
    await run(indexer, [update(true), update(false)]);
    expect(await indexer.PerpsMarket.getOrThrow(BTC)).toMatchObject({ enabled: false });
  });
});

describe("profiles", () => {
  it("names a trader, before or after they join, and keeps their counters", async () => {
    const indexer = createTestIndexer();
    const profile = (account: string, name: string, avatar: bigint) => ({
      contract: "ProfileRegistry" as const,
      event: "ProfileSet" as const,
      params: { account, name, avatar },
    });
    await run(indexer, [
      profile(ALICE, "Alice", 3n),
      created(1n),
      joined(1n, ALICE),
      joined(1n, BOB),
      profile(BOB, "Bob <b>", 0n),
      profile(ALICE, "Alicia", 5n),
    ]);

    expect(await indexer.Trader.getOrThrow(ALICE)).toMatchObject({
      name: "Alicia",
      avatar: 5,
      tournamentsJoined: 1,
    });
    // Stored as given: rendering it safely is the client's job.
    expect(await indexer.Trader.getOrThrow(BOB)).toMatchObject({ name: "Bob <b>", avatar: 0 });
  });
});
