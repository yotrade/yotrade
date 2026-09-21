# @yotrade/indexer

[Envio HyperIndex](https://docs.envio.dev) indexer for `TournamentManager` on Monad testnet. It feeds the tournament list, the participant list, the scorer and trader profiles.

| Entity | What it holds |
|---|---|
| `Tournament` | Config, status, participant count, posted winners, claims and refunds |
| `Entry` | Participant, trading account, capital at join (the ROI denominator), rank, prize, claim |
| `Trader` | Tournaments joined, podiums, wins, total prize |
| `Stats` | Global counters |

```bash
cp .env.example .env     # HyperSync token
bun run dev              # local indexer with a GraphQL endpoint
bun run test             # simulated events, no network
bun run test:live        # real events through HyperSync (needs ENVIO_API_TOKEN)
```

`ResultsVoided` reverses what `ResultsPosted` wrote, so ranks and podium counters stay correct when results are reposted.

After changing events in the contract, update `config.yaml` and run `bun run codegen`.
