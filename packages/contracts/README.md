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

## Deployments

| Network | Contract | Address |
|---|---|---|
| Monad testnet (10143) | TournamentManager (proxy) | [`0x5545a535D0782f8EdcE4Fb3373F65EcA10954F0D`](https://testnet.monadvision.com/address/0x5545a535D0782f8EdcE4Fb3373F65EcA10954F0D) |
| Monad testnet (10143) | Implementation | [`0xcF9D89E68E1D99830759d4E0A3296aA5C6eddD8c`](https://testnet.monadvision.com/address/0xcF9D89E68E1D99830759d4E0A3296aA5C6eddD8c) |

Both are verified on MonadVision. Machine-readable record: [`deployments/monad-testnet.json`](deployments/monad-testnet.json).

## Usage

```bash
bun run build
bun run test              # unit, guard, regression and invariant suites
bun run test:fork         # against the live Kuru testnet AccountCore (needs MONAD_TESTNET_RPC_URL)
bun run coverage
bun run snapshot:check
```

## Tests

| Suite | Path | Purpose |
|---|---|---|
| Unit | `test/TournamentManager.t.sol` | Lifecycle, payouts, upgrades |
| Guards | `test/TournamentManager.guards.t.sol` | Every validation and access-control revert |
| Regression | `test/regression` | One test per fixed defect, named after its issue |
| Invariant | `test/invariant` | Solvency and conservation of funds under random call sequences |
| Fork | `test/fork` | `join` against Kuru's deployed `AccountCore` |

CI enforces 100% line and branch coverage of `src/`, a gas snapshot within 5%, and Slither with no medium or high findings.

## Operations

Give `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` to a multisig, keep `SCORER_ROLE` on a separate hot key, and set a dispute window long enough for participants to check the published scores.

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
test/                unit, guard, regression, invariant and fork suites
script/              deployment and upgrade
lib/                 forge-std, OpenZeppelin (git submodules)
```
