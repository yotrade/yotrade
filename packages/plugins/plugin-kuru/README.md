# @yotrade/plugin-kuru

Kuru Spot V2 on Monad testnet for a YoTrade runtime: faucet, accounts, markets, swaps, portfolio valuation and the public data API.

```ts
import { createRuntime } from "@yotrade/core/plugin";
import { kuru } from "@yotrade/plugin-kuru/plugin";
import { monadTestnet } from "viem/chains";

const runtime = createRuntime({ chain: monadTestnet, plugins: [kuru()] });

await runtime.kuru.faucet.claim(wallet);                       // 10,000 test USDC and more
await runtime.kuru.account.deposit(wallet, usdc, 1_000_000_000n);
await runtime.kuru.market.swap(wallet, { market: "cbBTC/USDC", side: "buy", amountIn: 100_000_000n });

const { totalUsdc } = await runtime.kuru.portfolio(trader);    // balances valued at the mid
const fills = await runtime.kuru.data.trades(accountId);        // public, no key
```

## Behaviour worth knowing

- Every write waits for its receipt before returning. Monad has no global mempool, so a transaction sent right after another one is rejected.
- `swap` throws `EmptyBookError` when a market has no two-sided liquidity. Onchain such a swap succeeds and fills nothing.
- Values are integers in token units. `midPrice` returns a number for display only.

## Tests

```bash
bun run test        # offline
bun run test:live   # read-only checks against Monad testnet
```
