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

## Deploy

```bash
cp .env.example .env   # fill in the values
bun run deploy         # forge clean, then script/Deploy.s.sol with --broadcast
bun run upgrade        # forge clean, then script/Upgrade.s.sol (needs TOURNAMENT_MANAGER_PROXY)
forge verify-contract <address> TournamentManager --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```

Always deploy from a clean build. `forge coverage` compiles with different settings into the same cache, and an implementation built from it cannot be verified.

## Layout

```
src/
  TournamentManager.sol                  entry point: initializer and upgrade authorisation only
  TournamentBase.sol                     roles, pause, reentrancy guard, status and organizer guards
  TournamentStorage.sol                  the single ERC-7201 namespace (append only)
  libraries/PrizeSplit.sol               split validation and prize arithmetic
  modules/EscrowModule.sol               the pool in and out: create, cancel, reclaim, sweep
  modules/HostModule.sol                 what a host changes later: metadata, start now, invite
  modules/RegistrationModule.sol         join, allowlist, invite signature, trading-account checks
  modules/ResultsModule.sol              postResults, voidResults, claim
  modules/AdminModule.sol                venues, dispute window, pause, rescue
  modules/LensModule.sol                 every read
  perps/PerpsEngine.sol                  entry point: initializer, markets, pause, reads, upgrades
  perps/PerpsBase.sol                    roles, risk constants, pricing, valuing, filling, closing
  perps/modules/PerpsTradingModule.sol   trade, setLeverageCap
  perps/modules/PerpsSettlementModule.sol liquidate, settle
  perps/PerpsMath.sol, PerpsStorage.sol  pure arithmetic, the engine's ERC-7201 namespace
  venues/                                KuruVenueAdapter, PerpsVenueAdapter
  interfaces/                            ITournamentManager, IPerpsEngine, IVenueAdapter, IPyth, ...
test/                            unit, guard, regression, invariant and fork suites
script/                          deployment and upgrade
lib/                             forge-std, OpenZeppelin (git submodules)
```

Modules are abstract contracts over one shared storage namespace, compiled into a single implementation behind one UUPS proxy. One concern per module, one entry point per proxy that only wires them. A refactor that moves code between modules must leave the ABI, the selectors and the storage layout byte-identical; compare `forge inspect <Contract> abi|methodIdentifiers|storageLayout` before and after.
