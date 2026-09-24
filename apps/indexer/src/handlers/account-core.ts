import { type EvmOnEventContext, indexer } from "envio";

const ZERO = "0x0000000000000000000000000000000000000000";

/** Every Kuru account id, so an id in a balance event can be matched to a tournament's trading account. */
indexer.onEvent({ contract: "AccountCore", event: "AccountRegistered" }, ({ event, context }) => {
  context.KuruAccount.set({ id: event.params.accountId.toString(), account: event.params.account });
  return Promise.resolve();
});

interface Credit {
  readonly accountId: bigint;
  readonly token: string;
  readonly amount: bigint;
}

/**
 * Records money reaching a spot entry's trading account after the join and by the end. The join's own funding
 * lands before `Joined` in log order, when no entry exists yet, so only later top-ups are recorded: the scorer
 * adds them to the capital a return is measured against, and extra money buys no extra return.
 */
async function credit(
  { accountId, token, amount }: Credit,
  event: { block: { timestamp: number }; transaction: { hash: string }; logIndex: number },
  context: EvmOnEventContext,
): Promise<void> {
  const account = await context.KuruAccount.get(accountId.toString());
  if (!account || amount === 0n) {
    return;
  }
  const timestamp = BigInt(event.block.timestamp);
  // biome-ignore lint/style/useNamingConvention: Envio filter operator
  const entries = await context.Entry.getWhere({ tradingAccount: { _eq: account.account } });
  for (const entry of entries) {
    const tournament = await context.Tournament.get(entry.tournament_id);
    // Futures capital is virtual: its tournaments have no capital token and nothing on Kuru counts.
    if (!tournament || tournament.capitalToken === ZERO || timestamp > tournament.endTime) {
      continue;
    }
    context.CapitalIn.set({
      id: `${event.transaction.hash}-${event.logIndex}-${entry.id}`,
      entry_id: entry.id,
      tournament_id: tournament.id,
      token,
      amount,
      timestamp,
      tx: event.transaction.hash,
    });
  }
}

indexer.onEvent({ contract: "AccountCore", event: "Deposit" }, ({ event, context }) =>
  credit(
    { accountId: event.params.accountId, token: event.params.token, amount: event.params.amount },
    event,
    context,
  ),
);

indexer.onEvent(
  { contract: "AccountCore", event: "InternalAccountTransfer" },
  ({ event, context }) =>
    credit(
      {
        accountId: event.params.toAccountId,
        token: event.params.token,
        amount: event.params.amount,
      },
      event,
      context,
    ),
);
