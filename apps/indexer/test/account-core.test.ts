import { createTestIndexer } from "envio";
import { describe, expect, it } from "vitest";

const CHAIN = 10143;
const ORGANIZER = "0x00000000000000000000000000000000000000a1";
const ALICE = "0x00000000000000000000000000000000000000b1";
const TRADING = "0x00000000000000000000000000000000000000ff";
const USDC = "0xee0722ead54f1b4fe97be399be43bc0226a6f97e";
const ZERO = "0x0000000000000000000000000000000000000000";
const SPOT_VENUE = "0xadefe39b43673641e94ce99613c54266af2490e6";
const PERPS_VENUE = "0x97167b3126e2dee1fe8920c129bd118eb91e9881";
const ZERO_ROOT = `0x${"0".repeat(64)}`;

type Indexer = ReturnType<typeof createTestIndexer>;
const run = (indexer: Indexer, simulate: unknown[]) =>
  indexer.process({ chains: { [CHAIN]: { simulate } } } as Parameters<Indexer["process"]>[0]);

/** Starts at 1,000 and ends at 2,000. */
const created = (id: bigint, venue: string, capitalToken: string) => ({
  contract: "TournamentManager" as const,
  event: "TournamentCreated" as const,
  params: {
    id,
    organizer: ORGANIZER,
    config: [
      USDC,
      capitalToken,
      venue,
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
const joined = (id: bigint) => ({
  contract: "TournamentManager" as const,
  event: "Joined" as const,
  params: { id, participant: ALICE, tradingAccount: TRADING, capitalAtJoin: 100n },
});
const registered = {
  contract: "AccountCore" as const,
  event: "AccountRegistered" as const,
  params: {
    account: TRADING,
    accountId: 99n,
    rootAccountId: 99n,
    owner: TRADING,
    subaccountSeq: 0n,
  },
};
const deposit = (amount: bigint, timestamp: number) => ({
  contract: "AccountCore" as const,
  event: "Deposit" as const,
  block: { timestamp },
  params: { accountId: 99n, token: USDC, payer: ALICE, amount },
});

describe("capital reaching a trading account", () => {
  it("counts top-ups after the join and by the end, never the join's own funding", async () => {
    const indexer = createTestIndexer();
    await run(indexer, [
      created(1n, SPOT_VENUE, USDC),
      registered,
      deposit(100n, 900),
      joined(1n),
      deposit(50n, 1_500),
      {
        contract: "AccountCore" as const,
        event: "InternalAccountTransfer" as const,
        block: { timestamp: 1_600 },
        params: { fromAccountId: 7n, toAccountId: 99n, token: USDC, executor: ALICE, amount: 25n },
      },
      deposit(1_000n, 2_500),
    ]);
    // biome-ignore lint/style/useNamingConvention: Envio filter operator
    const rows = await indexer.CapitalIn.getWhere({ entry_id: { _eq: `1-${ALICE}` } });
    expect(rows.map((row) => row.amount).sort()).toEqual([25n, 50n]);
    expect(rows[0]).toMatchObject({ tournament_id: "1", token: USDC });
  });

  it("ignores futures entries, whose capital is virtual, and unknown account ids", async () => {
    const indexer = createTestIndexer();
    await run(indexer, [
      created(2n, PERPS_VENUE, ZERO),
      registered,
      joined(2n),
      deposit(50n, 1_500),
      {
        contract: "AccountCore" as const,
        event: "Deposit" as const,
        block: { timestamp: 1_500 },
        params: { accountId: 5n, token: USDC, payer: ALICE, amount: 7n },
      },
    ]);
    // biome-ignore lint/style/useNamingConvention: Envio filter operator
    expect(await indexer.CapitalIn.getWhere({ tournament_id: { _eq: "2" } })).toHaveLength(0);
  });
});
