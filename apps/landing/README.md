# @yotrade/landing

The marketing page for yotrade.xyz: Astro, TypeScript strict, Tailwind v4, no client framework. The layout follows the MotionSites "USD Halo" template, adapted to YoTrade: Inter instead of the template's paid face, our own copy, and real app screenshots in the modes card. Every line of copy and every link lives in `src/data/site.ts`; the template's videos and artwork are served from `public/media/`, compressed, not hotlinked.

```bash
bun run dev        # http://localhost:4321
bun run build      # static site in dist/
bun run typecheck  # astro check (TypeScript 6 here: astro check does not support 7 yet)
```

Motion: two looping marquees, the hero and modes videos, reveal-on-scroll, and the modes tabs. All of it stops under `prefers-reduced-motion`.
