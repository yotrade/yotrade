# @yotrade/contracts

Onchain lifecycle of a YoTrade tournament: registration, prize escrow, results and claims.

## TournamentManager

UUPS-upgradeable (OpenZeppelin 5.7, ERC-7201 storage), modular, role-based with a two-step delayed admin transfer, pausable. Trust model and threat analysis: [`SECURITY.md`](SECURITY.md).

| Actor | Can |
|---|---|
| Organizer | Create a tournament on an approved venue and escrow the prize pool. Cancel before it starts, reclaim if it is never scored, sweep what no winner is owed |
| Participant | Join with a Kuru trading account they own, holding exactly the starting capital. Claim a prize |
| Scorer | Post ranked winners once the tournament has ended |
| Admin | Approve venues, void results during the dispute window, cancel, pause, rescue surplus tokens, upgrade |

Scores are computed offchain from Kuru's public trade and balance data, so anyone can reproduce them. They become claimable only after the dispute window.

## Deployments

| Network | Contract | Address |
|---|---|---|
| Monad testnet (10143) | TournamentManager (proxy) | [`0xe60aFf1991d9D93e6093da5c813A63B746159D10`](https://testnet.monadvision.com/address/0xe60aFf1991d9D93e6093da5c813A63B746159D10) |
| Monad testnet (10143) | Implementation | [`0xdbC26eF2765912BF0B77e4A4cE0395e91089C698`](https://testnet.monadvision.com/address/0xdbC26eF2765912BF0B77e4A4cE0395e91089C698) |
| Monad testnet (10143) | KuruVenueAdapter | [`0xADefe39B43673641e94cE99613c54266af2490e6`](https://testnet.monadvision.com/address/0xADefe39B43673641e94cE99613c54266af2490e6) |

All three are verified on MonadVision. Machine-readable record: [`deployments/monad-testnet.json`](deployments/monad-testnet.json).

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
src/
  TournamentManager.sol          entry point: initializer, administration, views, upgrade authorisation
  TournamentBase.sol             roles, pause, reentrancy guard, shared status checks
  TournamentStorage.sol          the single ERC-7201 namespace (append only)
  libraries/PrizeSplit.sol       split validation and prize arithmetic
  modules/EscrowModule.sol       create, cancel, reclaim, sweep
  modules/RegistrationModule.sol join, allowlist, trading-account checks
  modules/ResultsModule.sol      postResults, voidResults, claim
  venues/KuruVenueAdapter.sol    proves a participant owns a Kuru trading account
  interfaces/                    ITournamentManager, IVenueAdapter, IAccountCore
test/                            unit, guard, regression, invariant and fork suites
script/                          deployment and upgrade
lib/                             forge-std, OpenZeppelin (git submodules)
```

Modules are abstract contracts over one shared storage namespace, compiled into a single implementation behind one UUPS proxy.
