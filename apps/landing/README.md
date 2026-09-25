# @yotrade/landing

The marketing page for yotrade.xyz: Astro, TypeScript strict, Tailwind v4, and one React island. The layout comes from the Helico landing, rewritten for YoTrade.

```bash
bun run dev        # http://localhost:4321
bun run build      # static site in dist/
bun run typecheck  # astro check (TypeScript 6 here: astro check does not support 7 yet)
```

- **Hero canvas** (`src/components/canvas/hero-canvas.tsx`): a simulated futures round. An ETH candle chart, six traders opening and closing on it, and a leaderboard that re-ranks as the price moves. The first frame comes from a seeded generator, so the server's render matches the browser's. It stops under `prefers-reduced-motion` and while the tab is hidden.
- **Read at build time, never typed in:** the `_exitPrice` snippet in the build section is sliced from `packages/contracts/src/perps/PerpsBase.sol`, and every test count comes from `src/lib/counts.ts`, which tallies the test files.
- **Rules table:** each rule links to the function that enforces it, pinned to a commit so the line numbers stay true.
- **Serving:** the `Dockerfile` builds the site and serves it from nginx-unprivileged on port 8080, with `/healthz`. `security-headers.conf` holds a strict CSP: same-origin only, with no analytics and no third-party scripts.
