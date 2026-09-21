# @yotrade/plugin-alchemy

Alchemy for a YoTrade runtime: a viem transport and the enhanced token-balance API.

```ts
import { createRuntime } from "@yotrade/core/plugin";
import { alchemy } from "@yotrade/plugin-alchemy/plugin";
import { alchemyTransport } from "@yotrade/plugin-alchemy/transport";
import { monadTestnet } from "viem/chains";

const runtime = createRuntime({
  chain: monadTestnet,
  transport: alchemyTransport(apiKey, 10143),
  plugins: [alchemy({ apiKey })],
});

await runtime.alchemy.getTokenBalances(owner);
```
