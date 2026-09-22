import { indexer, type Stats, type Trader } from "envio";

const BPS = 10_000n;
const STATS_ID = "global";
const ZERO_ROOT = `0x${"0".repeat(64)}`;

export const entryId = (tournamentId: bigint, participant: string) =>
  `${tournamentId}-${participant}`;

/** Same arithmetic as PrizeSplit.prize in the contract: rounds down. */
const prizeFor = (pool: bigint, shareBps: number | undefined) =>
  (pool * BigInt(shareBps ?? 0)) / BPS;

const emptyStats: Stats = {
  id: STATS_ID,
  tournaments: 0,
  entries: 0,
  traders: 0,
  prizesEscrowed: 0n,
  prizesClaimed: 0n,
};

export const newTrader = (id: string): Trader => ({
  id,
  name: "",
  avatar: 0,
  tournamentsJoined: 0,
  podiums: 0,
  wins: 0,
  totalPrize: 0n,
});

indexer.onEvent(
  { contract: "TournamentManager", event: "TournamentCreated" },
  async ({ event, context }) => {
    // Positional tuple, in the order of ITournamentManager.Config.
    const config = event.params.config;

    context.Tournament.set({
      id: event.params.id.toString(),
      organizer: event.params.organizer,
      prizeToken: config[0],
      capitalToken: config[1],
      venue: config[2],
      prizePool: config[3],
      startingCapital: config[4],
      startTime: config[5],
      endTime: config[6],
      maxParticipants: Number(config[7]),
      allowlisted: config[8] !== ZERO_ROOT,
      prizeSplitBps: config[9].map(Number),
      metadataURI: config[10],
      status: "OPEN",
      participantCount: 0,
      winners: [],
      claimableAt: 0n,
      prizesClaimed: 0n,
      returnedToOrganizer: 0n,
      createdAt: BigInt(event.block.timestamp),
      createdTx: event.transaction.hash,
    });

    const stats = (await context.Stats.get(STATS_ID)) ?? emptyStats;
    context.Stats.set({
      ...stats,
      tournaments: stats.tournaments + 1,
      prizesEscrowed: stats.prizesEscrowed + config[3],
    });
  },
);

indexer.onEvent({ contract: "TournamentManager", event: "Joined" }, async ({ event, context }) => {
  const { id, participant, tradingAccount, capitalAtJoin } = event.params;
  const tournament = await context.Tournament.getOrThrow(id.toString());
  const existingTrader = await context.Trader.get(participant);
  const trader = existingTrader ?? newTrader(participant);
  const stats = (await context.Stats.get(STATS_ID)) ?? emptyStats;

  context.Entry.set({
    id: entryId(id, participant),
    tournament_id: tournament.id,
    participant_id: participant,
    tradingAccount,
    capitalAtJoin,
    joinedAt: BigInt(event.block.timestamp),
    rank: undefined,
    prize: 0n,
    claimed: false,
    perpsFills: 0,
    perpsBalance: undefined,
    liquidated: false,
    settled: false,
  });
  context.Tournament.set({ ...tournament, participantCount: tournament.participantCount + 1 });
  context.Trader.set({ ...trader, tournamentsJoined: trader.tournamentsJoined + 1 });
  context.Stats.set({
    ...stats,
    entries: stats.entries + 1,
    traders: stats.traders + (existingTrader ? 0 : 1),
  });
});

indexer.onEvent(
  { contract: "TournamentManager", event: "ResultsPosted" },
  async ({ event, context }) => {
    const tournament = await context.Tournament.getOrThrow(event.params.id.toString());
    const winners = event.params.winners;

    for (const [index, winner] of winners.entries()) {
      const entry = await context.Entry.getOrThrow(entryId(event.params.id, winner));
      const trader = await context.Trader.getOrThrow(winner);

      context.Entry.set({
        ...entry,
        rank: index + 1,
        prize: prizeFor(tournament.prizePool, tournament.prizeSplitBps[index]),
      });
      context.Trader.set({
        ...trader,
        podiums: trader.podiums + 1,
        wins: trader.wins + (index === 0 ? 1 : 0),
      });
    }

    context.Tournament.set({
      ...tournament,
      status: "RESULTS_POSTED",
      winners: [...winners],
      claimableAt: event.params.claimableAt,
    });
  },
);

/** Undoes exactly what ResultsPosted did, so aggregates stay right when the scorer reposts. */
indexer.onEvent(
  { contract: "TournamentManager", event: "ResultsVoided" },
  async ({ event, context }) => {
    const tournament = await context.Tournament.getOrThrow(event.params.id.toString());

    for (const [index, winner] of tournament.winners.entries()) {
      const entry = await context.Entry.getOrThrow(entryId(event.params.id, winner));
      const trader = await context.Trader.getOrThrow(winner);

      context.Entry.set({ ...entry, rank: undefined, prize: 0n });
      context.Trader.set({
        ...trader,
        podiums: trader.podiums - 1,
        wins: trader.wins - (index === 0 ? 1 : 0),
      });
    }

    context.Tournament.set({ ...tournament, status: "OPEN", winners: [], claimableAt: 0n });
  },
);

indexer.onEvent(
  { contract: "TournamentManager", event: "PrizeClaimed" },
  async ({ event, context }) => {
    const { id, winner, amount } = event.params;
    const tournament = await context.Tournament.getOrThrow(id.toString());
    const entry = await context.Entry.getOrThrow(entryId(id, winner));
    const trader = await context.Trader.getOrThrow(winner);
    const stats = (await context.Stats.get(STATS_ID)) ?? emptyStats;

    context.Entry.set({ ...entry, claimed: true });
    context.Tournament.set({ ...tournament, prizesClaimed: tournament.prizesClaimed + amount });
    context.Trader.set({ ...trader, totalPrize: trader.totalPrize + amount });
    context.Stats.set({ ...stats, prizesClaimed: stats.prizesClaimed + amount });
  },
);

indexer.onEvent(
  { contract: "TournamentManager", event: "TournamentCancelled" },
  async ({ event, context }) => {
    const tournament = await context.Tournament.getOrThrow(event.params.id.toString());
    context.Tournament.set({
      ...tournament,
      status: "CANCELLED",
      returnedToOrganizer: tournament.returnedToOrganizer + event.params.refunded,
    });
  },
);

indexer.onEvent(
  { contract: "TournamentManager", event: "RemainderSwept" },
  async ({ event, context }) => {
    const tournament = await context.Tournament.getOrThrow(event.params.id.toString());
    context.Tournament.set({
      ...tournament,
      returnedToOrganizer: tournament.returnedToOrganizer + event.params.amount,
    });
  },
);
