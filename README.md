# YoTrade

Community trading tournaments, live on Monad.

Any community can host a perps trading tournament: members join from a link with a passkey, trade real markets, and follow a leaderboard that moves with every block.

Built for the [Monad Metropolis hackathon](https://monad.xyz/developers/hackathons/metropolis), Track 01: Onchain Finance & Trading.

> Status: early development, testnet only.

## Structure

| Path | Description |
|---|---|
| [`apps/web`](apps/web) | Mobile-first web app (Next.js 16, React 19, Tailwind v4) |
| [`apps/indexer`](apps/indexer) | Envio HyperIndex: tournaments, entries, results, trader stats |
| [`packages/contracts`](packages/contracts) | Tournament contracts (Foundry, Solidity 0.8.37, OpenZeppelin 5.7, UUPS) |
| `packages/core` | Plugin runtime (`definePlugin`, `createRuntime`) and Monad testnet addresses |
| `packages/plugins/*` | Reusable integrations composed through the runtime, one package each |
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
