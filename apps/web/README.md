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

## Deployment (Vercel)

1. Import the repository, set **Root Directory** to `apps/web`. Bun is detected from `bun.lock`.
2. Set the variables from `.env.example`. `NEXT_PUBLIC_RP_ID` is the production hostname, for example `yotrade.xyz`.
3. Fund the drip wallet with a small MON float and grant `SCORER_ROLE` to the scorer address.

Decide the domain before the first real user. Passkeys are scoped to the relying-party id and accounts are derived from the passkey: a different domain means new, empty accounts for everyone.

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
