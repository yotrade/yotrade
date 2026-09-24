# @yotrade/indexer

[Envio HyperIndex](https://docs.envio.dev) indexer for `TournamentManager`, `PerpsEngine`, `ProfileRegistry` and Kuru's `AccountCore` on Monad testnet. It feeds the tournament list, the participant list, the scorer, futures trade history and trader profiles.

| Entity | What it holds |
|---|---|
| `Tournament` | Config, status, participant count, posted winners, claims and refunds |
| `Entry` | Participant, trading account, capital at join (the ROI denominator), rank, prize, claim; for futures the fill count, last balance, liquidation and settlement |
| `Fill`, `Liquidation` | Every futures fill and liquidation, with the Pyth price and the balance after |
| `PerpsMarket` | Pyth feeds the futures venue accepts |
| `Trader` | Name and avatar from `ProfileRegistry`, tournaments joined, podiums, wins, total prize |
| `KuruAccount` | Kuru AccountCore id to address, for every account since AccountCore's deployment |
| `CapitalIn` | Each deposit or internal transfer reaching a spot entry's trading account after its join and by the end: added to the ROI denominator |
| `Stats` | Global counters |

```bash
cp .env.example .env     # HyperSync token
bun run dev              # local indexer with a GraphQL endpoint
bun run test             # simulated events, no network
bun run test:live        # real events through HyperSync (needs ENVIO_API_TOKEN)
```

`ResultsVoided` reverses what `ResultsPosted` wrote, so ranks and podium counters stay correct when results are reposted.

After changing events in the contract, update `config.yaml` and run `bun run codegen`.

## Deployment

Envio Cloud deploys every push to the `envio` branch, from `apps/indexer` alone with pnpm. Keep this package free of workspace imports, and push to `envio` only when the indexer changes: each push re-indexes from the start block.

```bash
git push origin main:envio
```

**Lifespan.** Envio Cloud deletes development-plan deployments 30 days after they are created, and each deployment has its own URL. `scripts/refresh-indexer.sh` starts a fresh one and moves production to it:
- It deletes the oldest unused deployment when the three-deployment limit is reached, after asking.
- It pushes an empty commit to `envio` and waits for the full sync.
- It sets `NEXT_PUBLIC_INDEXER_URL` in Coolify and redeploys.
- It sets the `INDEXER_URL` repository variable the liquidator workflow reads.

Run it at least every 30 days, and on 12 or 13 Oct 2026 so the deployment outlives judging (until 3 Nov). `/api/health` reports `indexer.ok` and its lag in blocks, and the `watch` workflow emails when it is down or more than about ten minutes behind.
