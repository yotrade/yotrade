# @yotrade/web

Mobile-first web app for YoTrade. Next.js 16 (App Router), React 19, Tailwind v4.

```bash
cp .env.example .env.local
bun run dev
```

## Structure

```
src/
  app/             routes only, no business logic
  components/ui/   small accessible primitives (button, card, field)
  lib/             env (validated at startup), runtime (plugins wired once), hooks
  features/        one folder per product slice
  server/          server-only code
```

## Conventions

- Integrations are reached through the runtime (`useRuntime()`), never imported ad hoc
- Environment variables are parsed with zod in `lib/env.ts`; a bad value stops the app at startup
- Workspace packages are consumed as TypeScript source through `transpilePackages`
- Security headers are set in `next.config.ts`; passkey permissions are limited to this origin
- `GET /api/health` reports liveness and RPC reachability
