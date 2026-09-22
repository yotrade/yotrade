# @yotrade/web

Mobile-first web app for YoTrade. Next.js 16 (App Router), React 19, Tailwind v4.

```bash
cp .env.example .env.local
bun run dev
```

## Routes

| Route | Purpose |
|---|---|
| `/` | Passkey onboarding and the tournament list |
| `/new` | Host a tournament |
| `/t/[id]` | Join, trade, leaderboard, commentary, results and claim |
| `POST /api/drip` | Testnet MON for new passkey accounts, rate limited |
| `GET /api/leaderboard/[id]` | Scores from Kuru's public PnL, cached |
| `POST /api/tournaments/[id]/finalize` | Permissionless trigger; winners are computed server side |
| `GET /api/commentary/[id]?lang=` | Kimi commentary, cached per language |
| `GET /api/health` | Liveness and RPC reachability |

## Server environment

| Variable | Without it |
|---|---|
| `DRIP_PRIVATE_KEY` | New accounts get no gas: `/api/drip` answers 503 |
| `SCORER_PRIVATE_KEY` (holds `SCORER_ROLE` only) | Results cannot be posted: finalize answers 503 |
| `KIMI_API_KEY` | The commentary card stays hidden |
| `PYTH_API_KEY` | Futures cannot be traded or scored: `/api/pyth` answers 503 |
| `BLOB_READ_WRITE_TOKEN` (Vercel Blob) | Hosts cannot upload a logo; the create flow shows the link field instead |
| `LOGO_BLOCKLIST` (optional, comma-separated substrings) | Every tournament logo is served; set it to hide a logo that must go, since metadata onchain cannot be changed |

## End-to-end checks

Browser scripts in [`e2e/`](e2e) drive the real app against Monad testnet with headless Chrome (`playwright-core`, `channel: chrome`). They sign in with the seeded identity, so set `NEXT_PUBLIC_E2E_PRF_SEED` in `.env.local` and run `bun run dev`; point `E2E_BASE_URL` at it when it is not on port 3000.

| Script | What it proves | Sends transactions |
|---|---|---|
| `bun run e2e:crawl` | Every route: no console output, named controls, labelled inputs, no overflow, nothing stuck loading, one heading | No |
| `bun run e2e:create` | The three-step create flow validates and goes back | No |
| `bun run e2e:session` | A reload keeps the session, sign-out ends it | No |
| `bun run e2e:chart` | Timeframes, wheel zoom, drag pan, reset | No |
| `bun run e2e:profile` | Name and avatar save, and publish to open tournaments | Yes |
| `bun run e2e:invite` | A private tournament hides, refuses without the code, refuses a wrong pasted code, admits the right one | Yes |
| `bun run e2e:host` | The organizer finds the tournament on Home, renames it, is offered cancel, backs out, then cancels | Yes |
| `bun run e2e:futures` | Create, join, long, close, short, finalize with settlement (about eight minutes) | Yes |

Each script exits non-zero on a failed check and leaves screenshots in `e2e/shots/`.

## Deployment

The live app runs at [app.yotrade.xyz](https://app.yotrade.xyz) from the container image defined in the repository's root `Dockerfile`: a standalone Next.js server traced from the monorepo root, listening on port 3000. Coolify on the VPS builds it from `main` and publishes it on `127.0.0.1:3030`; the host's nginx terminates TLS with a Let's Encrypt certificate and proxies to that port (`setup-yotrade-nginx.sh` on the host, rerunnable). Deploys are triggered through the Coolify API after a merge; there is no push hook.

1. `NEXT_PUBLIC_*` variables are inlined at build time, so they are build arguments of the image. `NEXT_PUBLIC_RP_ID` is `yotrade.xyz`: passkeys are scoped to it, so the app can move between subdomains without anyone losing an account.
2. The server variables above are runtime environment of the container.
3. Fund the drip wallet with a small MON float and grant `SCORER_ROLE` to the scorer address.

Vercel works too: import the repository with **Root Directory** `apps/web` and set the same variables.

Decide the domain before the first real user. Accounts are derived from the passkey under the relying-party id: a different id means new, empty accounts for everyone.

Rate limits, caches and send queues are in memory, which is correct for one instance. Move them to a shared store before scaling out.

## Structure

```
src/
  app/             routes and route handlers, no business logic
  components/      feature components; ui/ holds the accessible primitives
  lib/             env, runtime, hooks and pure logic (join, create, ticket, format)
  server/          server-only code: drip, scoring, leaderboard, finalize, commentary
```

## Conventions

- Integrations are reached through the runtime (`useRuntime()`), never imported ad hoc
- Environment variables are parsed with zod in `lib/env.ts`; a bad value stops the app at startup
- Workspace packages are consumed as TypeScript source through `transpilePackages`
- Security headers are set in `next.config.ts`; passkey permissions are limited to this origin
- Money paths (`join`, `create`, `ticket`, `scoring`, `finalize`, `drip`) are pure or dependency-injected and unit tested; flows are verified against Monad testnet from a real browser

## Design

Structure and components follow the Ghost Crypto Wallet UI Kit (light mode, Figma Community) by Samson Oluwajunse: onboarding flow, pill buttons, borderless cards, input wells, list rows, chips. Colour and type follow [Monad's brand kit](https://monad.xyz/brand-and-media-kit): `#6E54FF`, `#DDD7FE`, `#0E091C`, Inter and Roboto Mono.

Icons and the onboarding illustration in `public/icons` and `public/illustrations` come from that kit (icons by [Streamline](https://www.streamlinehq.com)), recoloured to the Monad palette. Motion is CSS only and switches off under `prefers-reduced-motion`.
