import { indexer } from "envio";

import { entryId } from "./tournament-manager.js";

const logId = (hash: string, logIndex: number) => `${hash}-${logIndex}`;

indexer.onEvent({ contract: "PerpsEngine", event: "MarketUpdated" }, ({ event, context }) => {
  context.PerpsMarket.set({ id: event.params.market, enabled: event.params.enabled });
  return Promise.resolve();
});

/** On the futures venue the trader is the participant, so the entry is known from the event alone. */
indexer.onEvent({ contract: "PerpsEngine", event: "Traded" }, async ({ event, context }) => {
  const { tournamentId, trader, market, sizeDelta, price, realizedPnl, fee, newSize, balance } =
    event.params;
  const entry = await context.Entry.getOrThrow(entryId(tournamentId, trader));

  context.Fill.set({
    id: logId(event.transaction.hash, event.logIndex),
    entry_id: entry.id,
    tournament_id: tournamentId.toString(),
    trader_id: trader,
    market,
    sizeDelta,
    price,
    realizedPnl,
    fee,
    newSize,
    balance,
    timestamp: BigInt(event.block.timestamp),
    tx: event.transaction.hash,
  });
  context.Entry.set({ ...entry, perpsFills: entry.perpsFills + 1, perpsBalance: balance });
});

indexer.onEvent({ contract: "PerpsEngine", event: "Liquidated" }, async ({ event, context }) => {
  const { tournamentId, trader, liquidator, balance } = event.params;
  const entry = await context.Entry.getOrThrow(entryId(tournamentId, trader));

  context.Liquidation.set({
    id: `${event.block.hash}-${event.logIndex}`,
    entry_id: entry.id,
    tournament_id: tournamentId.toString(),
    liquidator,
    balance,
    timestamp: BigInt(event.block.timestamp),
  });
  context.Entry.set({ ...entry, liquidated: true, perpsBalance: balance });
});

indexer.onEvent({ contract: "PerpsEngine", event: "Settled" }, async ({ event, context }) => {
  const { tournamentId, trader, balance } = event.params;
  const entry = await context.Entry.getOrThrow(entryId(tournamentId, trader));
  context.Entry.set({ ...entry, settled: true, perpsBalance: balance });
});
