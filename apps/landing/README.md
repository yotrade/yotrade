# @yotrade/landing

The marketing page for yotrade.xyz: Astro, TypeScript strict, plain CSS, no client framework. Every line of copy and every link lives in `src/data/site.ts`; the screenshots in `public/shots/` are the real app.

```bash
bun run dev        # http://localhost:4321
bun run build      # static site in dist/
bun run typecheck  # astro check (TypeScript 6 here: astro check does not support 7 yet)
```

Motion is CSS only, plus one small observer that reveals sections as they scroll in, and all of it is switched off under `prefers-reduced-motion`.
