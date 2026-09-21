# @yotrade/plugin-tournament

Typed client for the `TournamentManager` contract, exposed as `runtime.tournament`.

```ts
import { createRuntime } from "@yotrade/core/plugin";
import { tournament } from "@yotrade/plugin-tournament/plugin";
import { monadTestnet } from "viem/chains";

const runtime = createRuntime({ chain: monadTestnet, plugins: [tournament()] });

const [latest] = await runtime.tournament.latest(1);
latest?.phase;                                             // upcoming | live | scoring | dispute | claimable | cancelled

await runtime.tournament.join(wallet, id, tradingAccount);
await runtime.tournament.claim(wallet, id);
```

Types come straight from the contract ABI, so a change to `TournamentManager` that breaks the client fails `typecheck`.

## Regenerating the ABI

```bash
cd packages/contracts && forge build
cd ../plugins/plugin-tournament && bun run generate
```

`test/abi.test.ts` fails when the committed ABI no longer matches the contract.

## Not here

Listing a tournament's participants needs the `Joined` logs. Monad RPCs cap `eth_getLogs` ranges, so that query belongs to the indexer.
