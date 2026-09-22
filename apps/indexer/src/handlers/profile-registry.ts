import { indexer } from "envio";

import { newTrader } from "./tournament-manager.js";

/** A profile can be set before the account ever joins, so the trader row is created on demand. */
indexer.onEvent(
  { contract: "ProfileRegistry", event: "ProfileSet" },
  async ({ event, context }) => {
    const { account, name, avatar } = event.params;
    const trader = (await context.Trader.get(account)) ?? newTrader(account);
    context.Trader.set({ ...trader, name, avatar: Number(avatar) });
  },
);
