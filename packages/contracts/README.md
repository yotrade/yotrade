# @yotrade/contracts

Onchain lifecycle of a YoTrade tournament: registration, prize escrow, results and claims.

## TournamentManager

UUPS-upgradeable (OpenZeppelin 5.7, ERC-7201 storage), role-based, pausable.

| Actor | Can |
|---|---|
| Organizer | Create a tournament and escrow the prize pool. Cancel before it starts, reclaim if it is never scored, sweep what no winner is owed |
| Participant | Join with a Kuru trading account they own, holding exactly the starting capital. Claim a prize |
| Scorer | Post ranked winners once the tournament has ended |
| Admin | Void results during the dispute window, cancel, pause, upgrade |

Scores are computed offchain from Kuru's public trade and balance data, so anyone can reproduce them. They become claimable only after the dispute window.

## Usage

```bash
forge build
forge test
forge fmt
```

## Deploy

```bash
cp .env.example .env   # fill in the values
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
forge verify-contract <implementation> TournamentManager --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```

Upgrade with `script/Upgrade.s.sol` after setting `TOURNAMENT_MANAGER_PROXY`.

## Layout

```
src/                 TournamentManager and interfaces
test/                unit, fuzz and upgrade tests
script/              deployment and upgrade
lib/                 forge-std, OpenZeppelin (git submodules)
```
