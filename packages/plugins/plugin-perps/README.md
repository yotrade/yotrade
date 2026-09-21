# @yotrade/plugin-perps

Client for the futures venue: `PerpsEngine` paper perpetuals priced by Pyth.

```ts
import { hermes } from "@yotrade/plugin-perps/hermes";
import { perps } from "@yotrade/plugin-perps/plugin";

const runtime = createRuntime({
  chain: monadTestnet,
  plugins: [perps({ hermes: hermes({ baseUrl: "/api/pyth" }) })],
});

await runtime.perps.trade(wallet, { tournamentId: 7n, market: pyth.feeds["BTC/USD"], sizeDelta: 10n ** 17n });
const { balance, positions } = await runtime.perps.account(7n, wallet.account.address);
```

- `./math` mirrors the contract's arithmetic in `bigint`: PnL, fees, equity, leverage, the largest size the cap allows, and the score.
- `./hermes` fetches signed price updates. Hermes needs an API key, so browsers point `baseUrl` at a same-origin proxy and servers pass the endpoint with an `Authorization` header.
- `trade` sends an update that covers every open market, because a fill that adds risk values the whole account. `settle` asks Hermes for the first update at the tournament's end, the only one the contract accepts.

Run `bun run generate` after changing `PerpsEngine`; a test fails when the committed ABI is stale.
