# YoTrade

Community trading tournaments, live on Monad.

Any community can host a perps trading tournament: members join from a link with a passkey, trade real markets, and follow a leaderboard that moves with every block.

Built for the [Monad Metropolis hackathon](https://monad.xyz/developers/hackathons/metropolis) — Track 01, Onchain Finance & Trading.

## Repository layout

| Path | What |
|---|---|
| `contracts/` | Foundry project — tournament contract (Solidity 0.8.28) |
| `web/` | Mobile-first web app (coming next) |

## Contracts

```bash
git submodule update --init --recursive
cd contracts
forge build
forge test
```

Network: Monad testnet, chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`.

> Status: early development. Testnet only.
