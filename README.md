# YoTrade

Who's the best trader in your community? Find out live on Monad.

YoTrade lets any community host a trading tournament. A host escrows a prize pool in a contract and shares a link. Members join with a passkey, get a fresh trading account with standardized test capital, and trade real [Kuru](https://kuru.io) order books. A leaderboard anyone can recompute follows every fill, [Kimi](https://platform.kimi.ai) comments on it in the community's language, and the contract pays the winners.

Built for the [Monad Metropolis hackathon](https://monad.xyz/developers/hackathons/metropolis), Track 01: Onchain Finance & Trading. Testnet only.

## How it works

| Step | What happens | Measured on testnet |
|---|---|---|
| Host | Gas, test funds, approve, `createTournament` escrows the pool | 11 s from tap to listed |
| Join | Passkey → derived account → gas, faucet, Kuru deposit, `join` | 11 s, five transactions |
| Trade | Market orders with empty-side, price-impact and slippage guards | 2 to 4 s per order |
| Score | Kuru's public fills + `capitalAtJoin`; deposits cannot move a score | 1.1 s cold, 5 ms cached |
| Settle | Anyone finalizes, winners are computed, review window, claim | 3 s to post, 8 s to claim |

More in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Deployment (Monad testnet, chain 10143)

| Contract | Address |
|---|---|
| `TournamentManager` (UUPS proxy) | [`0xe60aFf1991d9D93e6093da5c813A63B746159D10`](https://testnet.monadvision.com/address/0xe60aFf1991d9D93e6093da5c813A63B746159D10) |
| `KuruVenueAdapter` | [`0xADefe39B43673641e94cE99613c54266af2490e6`](https://testnet.monadvision.com/address/0xADefe39B43673641e94cE99613c54266af2490e6) |
| `ProfileRegistry` (immutable, ownerless) | [`0x9d8B6852705dD7585B3907244d603547a4eA32d6`](https://testnet.monadvision.com/address/0x9d8B6852705dD7585B3907244d603547a4eA32d6) |

Verified on MonadVision (Sourcify). History and configuration: [`packages/contracts/deployments`](packages/contracts/deployments).

## Structure

| Path | Description |
|---|---|
| [`apps/web`](apps/web) | Mobile-first web app and server routes (Next.js 16, React 19, Tailwind v4) |
| [`apps/indexer`](apps/indexer) | Envio HyperIndex: tournaments, entries, results, trader stats |
| [`packages/contracts`](packages/contracts) | Tournament contracts (Foundry, Solidity 0.8.37, OpenZeppelin 5.7, UUPS) |
| `packages/core` | Plugin runtime (`definePlugin`, `createRuntime`) and Monad testnet addresses |
| `packages/plugins/*` | Reusable integrations, one package each: `plugin-mera`, `plugin-kuru`, `plugin-tournament`, `plugin-alchemy` |
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
