# Security

Scope: `src/` of this package. Status: **not audited**. Testnet only until it is.

## What is at risk

Prize pools escrowed by organizers, and the integrity of a tournament's outcome. Participants' trading funds never enter these contracts; they stay in the participant's own venue account.

## Trust model

| Role | Holder (intended) | Can | Cannot |
|---|---|---|---|
| Default admin | Multisig, two-step transfer with delay | Approve venues, set the dispute window (max 7 days), void results inside the window, cancel an open tournament (refund to organizer), rescue surplus tokens, grant roles | Move escrowed prizes anywhere except to winners or back to the organizer |
| Upgrader | Multisig, ideally behind a timelock | Replace the implementation | — (full power: treat as the root of trust) |
| Scorer | Hot key of the scoring service | Post ranked winners after the end time | Post before the end, name non-participants or duplicates, touch funds, shorten the dispute window |
| Pauser | Multisig or ops key | Stop `createTournament`, `join`, `postResults` | Stop claims, refunds or sweeps |
| Organizer | Anyone | Create, cancel before start, reclaim if never scored, receive the unallocated remainder | Withdraw after results are posted, change the config |

Scores are computed offchain from the venue's public data and are reproducible by anyone. A wrong or malicious result is handled by the dispute window: the admin voids it and the scorer posts again.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| Reentrancy through a prize token | Transient reentrancy guard on every function that transfers; state and events are final before the transfer |
| Fee-on-transfer or short-paying prize token | Balance delta must equal the pool, otherwise creation reverts |
| Prize pool stuck forever | Cancel (before start), reclaim (7 days after the end without results), sweep (remainder after the window) always lead out |
| Admin draining prizes via `rescue` | `rescue` can only send `balance − escrowed[token]`; the escrow counter moves with every deposit and payout and is covered by an invariant |
| Registering someone else's trading account | A venue adapter must confirm the caller owns the account; tournaments without an approved venue are rejected |
| Blocking a join with a dust deposit (venue allows deposits to any account) | Capital check is a minimum, the real balance is recorded as the ROI denominator |
| Scorer key compromise | No access to funds; results only after the end; admin can void inside the dispute window; pausing blocks further posts |
| Admin key loss or hijack by a single signature | One default admin, two-step transfer with a delay (`AccessControlDefaultAdminRules`) |
| Storage collision on upgrade | One ERC-7201 namespace, append only; OpenZeppelin parents use their own namespaces |
| Initializing the implementation | Constructor disables initializers |
| Validator timestamp drift | Schedules are in hours and days; a few seconds cannot change an outcome |
| Merkle second-preimage on the allowlist | Leaves are double-hashed |
| Log reordering by a callback | Events are emitted before external calls, pinned by a regression test |

## Invariants (stateful fuzzing, `test/invariant`)

1. For every token, the contract's balance is at least `escrowed[token]`, and `escrowed[token]` equals the sum of `unpaid` over its tournaments.
2. Every escrowed token ends up claimed by a winner, returned to an organizer, or still held. Nothing else.
3. `unpaid ≤ prizePool`, participants never exceed the cap, winners never exceed the split, cancelled tournaments hold nothing.

## Known limitations

- Outcome integrity depends on honest scoring plus an attentive admin during the dispute window.
- The upgrader can change everything. Use a multisig and a timelock before holding real value.
- Rebasing tokens that shrink balances would break solvency; use plain ERC-20 prize tokens.
- A token that blocklists a winner blocks only that winner's claim.
- Venue adapters are trusted code: an approved adapter that lies weakens registration, not escrow.

## Operations checklist

- [ ] Default admin and upgrader are multisigs; scorer is a separate hot key; nobody holds all roles
- [ ] Admin transfer delay and dispute window set for the value at stake
- [ ] Deployed from a clean build (`bun run deploy` / `bun run upgrade`); implementation and proxy verified on the explorer
- [ ] Only reviewed venue adapters approved
- [ ] Monitoring on `ResultsPosted`, `ResultsVoided`, `Upgraded`, role and venue events

## Reporting

Open a private security advisory on the repository. Please do not file public issues for vulnerabilities.

## ProfileRegistry

Display names and avatars, set by each account for itself. It is immutable, has no owner and cannot hold value, so there is no role to compromise and nothing to drain.

| Threat | Mitigation |
|---|---|
| Setting someone else's profile | Only `msg.sender` is ever written |
| Storage or gas griefing through long names | Names are capped at 32 bytes; every write is paid by the writer into its own slot |
| Markup or script in a name | The contract stores bytes; clients must render names as text and never as HTML |
| Impersonation by choosing another trader's name | Not preventable onchain; clients show the address next to the name where it matters (results, claims) |
