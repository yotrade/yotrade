# YoTrade

Who's the best trader in your community? Find out live on Monad.

YoTrade lets any community host a trading tournament. A host escrows a prize pool in a contract, picks the market and who may join, and shares a link. Members join with a passkey and get a fresh trading account per tournament: on **Spot** they trade real [Kuru](https://kuru.io) order books with standardized test capital; on **Futures** they go long or short at [Pyth](https://pyth.network) prices with the same virtual $10,000 as everyone else. A leaderboard anyone can recompute follows every fill, [Kimi](https://platform.kimi.ai) comments on it in the community's language, and the contract pays the winners.

**Private tournaments** are hidden from the arena and need an invite: the code is derived from the host's passkey, its address goes onchain, and the contract checks the code's signature on every join. Leaked links are revoked by rotating the code. Hosts can add a logo (upload or link), traders a name and avatar, all stored onchain.

Built for the [Monad Metropolis hackathon](https://monad.xyz/developers/hackathons/metropolis), Track 01: Onchain Finance & Trading. Testnet only. App: [app.yotrade.xyz](https://app.yotrade.xyz) · Landing: [yotrade.xyz](https://yotrade.xyz).

## How it works

| Step | What happens | Measured on testnet |
|---|---|---|
| Host | Three steps: basics, prize, schedule; `createTournament` escrows the pool | 2 s once confirmed |
| Join | Passkey → derived account → gas, faucet, Kuru deposit, `join` (Futures: gas and `join` only) | 11 s spot, 6 s futures |
| Trade | Spot: market orders with empty-side, impact and slippage guards. Futures: a signed Pyth update rides with every order, up to 100x in every tournament, permissionless liquidation, and a way out that never waits for the oracle | 2 to 5 s per order |
| Score | Spot: Kuru's public fills inside the window, frozen at the last traded price once it ends, over the capital at join plus anything added later. Futures: equity at Pyth prices. Money added buys no return | 1.1 s cold, 5 ms cached |
| Settle | Anyone finalizes: futures positions close at the first Pyth price after the end, winners are posted, review window, claim | 6 s to post, 8 s to claim |

More in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Who it is for

The first users are university blockchain clubs and regional crypto communities, starting with Indonesia and the other Metropolis community supporters. Their lead wants an activity with bragging rights, most members are new to perps and trade small accounts, and a protocol or the community treasury funds the prize to meet traders. Exchanges run a few huge contests for whales; nobody lets a 30-person community run its own with a fair, recomputable score and a contract that pays out.

## Try it in two minutes

Open [app.yotrade.xyz](https://app.yotrade.xyz) on a phone or a laptop. There are no accounts to create and no credentials to enter: one passkey prompt makes the account, and testnet gas and funds arrive on their own.

1. Pick a live tournament in the arena and tap **Join**. Spot joins in about 11 seconds, Futures in 6.
2. Trade a couple of times. Spot fills land on Kuru's order book; Futures orders carry a signed Pyth price.
3. Watch the round at the top of the tournament page: the busiest market's candles with every trader's fills pinned on them, their avatars on the chart and a tape of who did what. Below it, the leaderboard moves and Kimi comments on it. Your rows are highlighted.
4. Host one yourself from **Host**: three steps, a private one hands you an invite link derived from your passkey.

Clear the site data or open a fresh browser and sign in with the same passkey: the account, the tournaments you joined, your profile and your invite links all come back, because nothing lives only on the device.

## Sponsor stack

| Sponsor | Where it is used |
|---|---|
| Mera | The whole account layer: one passkey ceremony, a signing session per tab so nothing prompts again, and PRF namespaces that mint a trading account per tournament and an invite capability per private tournament, all reconstructible from the passkey ([`packages/plugins/plugin-mera`](packages/plugins/plugin-mera)) |
| Kuru | Spot tournaments trade real Kuru order books through the SDK, with the faucet and deposit inside the join flow and Kuru's public fills feeding the score ([`packages/plugins/plugin-kuru`](packages/plugins/plugin-kuru)) |
| Pyth | Futures tournaments price and settle on Pyth updates that ride with every order; settlement uses the first update after the end ([`packages/contracts/src/perps`](packages/contracts/src/perps)) |
| Envio | HyperIndex on Envio Cloud: tournaments, entries, results, futures fills and liquidations, profiles and per-trader stats drive every list, page and leaderboard ([`apps/indexer`](apps/indexer)) |
| Kimi | Commentary on each tournament in the community's language, from the live standings and the last fills ([`apps/web/src/server/commentary.ts`](apps/web/src/server/commentary.ts)) |
| Alchemy | The first RPC transport, with batching on top. The server's work (drip, scorer, liquidator, leaderboard, room) goes through `ALCHEMY_API_KEY`, and browsers go through `NEXT_PUBLIC_ALCHEMY_API_KEY` when it is set. The public RPC stands behind it: a failing or rate-limited call falls through on the same request, and ranking moves whichever keeps failing to the back. Production sets only the server key while Alchemy rate-limits Monad Testnet: its 429 responses carry no CORS header, so a browser would log an error on every call ([`packages/plugins/plugin-alchemy`](packages/plugins/plugin-alchemy), [`apps/web/src/lib/runtime.ts`](apps/web/src/lib/runtime.ts)) |

## Deployment (Monad testnet, chain 10143)

| Contract | Address |
|---|---|
| `TournamentManager` (UUPS proxy) | [`0xe60aFf1991d9D93e6093da5c813A63B746159D10`](https://testnet.monadvision.com/address/0xe60aFf1991d9D93e6093da5c813A63B746159D10) |
| `KuruVenueAdapter` | [`0xADefe39B43673641e94cE99613c54266af2490e6`](https://testnet.monadvision.com/address/0xADefe39B43673641e94cE99613c54266af2490e6) |
| `PerpsEngine` (UUPS proxy) | [`0x33F9Aa5A77a5795D416DD0903bE209Ca1643F336`](https://testnet.monadvision.com/address/0x33F9Aa5A77a5795D416DD0903bE209Ca1643F336) |
| `PerpsVenueAdapter` | [`0x97167B3126E2dEE1FE8920C129bD118Eb91e9881`](https://testnet.monadvision.com/address/0x97167B3126E2dEE1FE8920C129bD118Eb91e9881) |
| `ProfileRegistry` (immutable, ownerless) | [`0x9d8B6852705dD7585B3907244d603547a4eA32d6`](https://testnet.monadvision.com/address/0x9d8B6852705dD7585B3907244d603547a4eA32d6) |

Verified on MonadVision (Sourcify). History and configuration: [`packages/contracts/deployments`](packages/contracts/deployments).

## Structure

| Path | Description |
|---|---|
| [`apps/web`](apps/web) | Mobile-first web app and server routes (Next.js 16, React 19, Tailwind v4) |
| [`apps/landing`](apps/landing) | The landing at yotrade.xyz (Astro, one React island); test counts and the contract snippet are read from the sources at build time |
| [`apps/indexer`](apps/indexer) | Envio HyperIndex: tournaments, entries, results, futures fills, profiles, trader stats |
| [`packages/contracts`](packages/contracts) | `TournamentManager` and `PerpsEngine` (Foundry, Solidity 0.8.37, OpenZeppelin 5.7, UUPS) |
| `packages/core` | Plugin runtime (`definePlugin`, `createRuntime`) and Monad testnet addresses |
| `packages/plugins/*` | Reusable integrations, one package each: `plugin-mera`, `plugin-kuru`, `plugin-perps`, `plugin-tournament`, `plugin-alchemy` |
| `packages/tsconfig` | Shared strict TypeScript configuration |

TypeScript packages are consumed as source through explicit subpath exports: no barrel files, no build step.

## Requirements

[Bun](https://bun.sh) 1.3+, [Foundry](https://getfoundry.sh) 1.8+ and Node.js 22+ (for the indexer tooling).

## Getting started

```bash
git clone --recurse-submodules https://github.com/yotrade/yotrade.git
cd yotrade
bun install
```

## Commands

| Command | Description |
|---|---|
| `bun run build` | Build every package |
| `bun run test` | Run all tests |
| `bun run lint` | Lint and check formatting |
| `bun run typecheck` | Type-check every TypeScript package |
| `bun run format` | Format and apply safe fixes |

Tasks are orchestrated by [Turborepo](https://turborepo.com); formatting and linting by [Biome](https://biomejs.dev).

## Quality gates

| Gate | Runs |
|---|---|
| `pre-commit` | Biome on staged files, `forge fmt --check` when Solidity is staged |
| `commit-msg` | [Conventional Commits](https://www.conventionalcommits.org) |
| `pre-push` | `biome ci`, then lint, build and tests for every package |
| CI | The above, plus gas snapshot, 100% contract coverage, fork tests and Slither |

Foundry 1.8 or later is required: tests execute with Monad's gas model (`network = "monad"`).

## Network

Monad testnet, chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`.
