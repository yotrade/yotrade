# YoTrade

Community trading tournaments, live on Monad.

Any community can host a perps trading tournament: members join from a link with a passkey, trade real markets, and follow a leaderboard that moves with every block.

Built for the [Monad Metropolis hackathon](https://monad.xyz/developers/hackathons/metropolis), Track 01: Onchain Finance & Trading.

> Status: early development, testnet only.

## Structure

| Path | Description |
|---|---|
| `apps/` | Deployable applications |
| `packages/contracts` | Tournament contracts (Foundry, Solidity 0.8.28) |

## Requirements

[Bun](https://bun.sh) 1.3+ and [Foundry](https://getfoundry.sh).

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
| `bun run format` | Format and apply safe fixes |

Tasks are orchestrated by [Turborepo](https://turborepo.com); formatting and linting by [Biome](https://biomejs.dev). A pre-commit hook checks staged files.

## Network

Monad testnet, chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`.
