import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * A futures round in motion: an ETH candle chart, a handful of traders opening and closing on it,
 * and the board re-ranking with every tick. A simulation: the rules are the app's (the same
 * $10,000 for everyone, return on capital, the same price for all), the traders and prices are not.
 */

type Candle = { o: number; h: number; l: number; c: number };
type Trader = { name: string; hue: string; size: number; entry: number; realized: number };
type Fill = {
  id: number;
  who: string;
  hue: string;
  action: "long" | "short" | "close";
  size: number;
  price: number;
  at: number;
};
type State = { tick: number; first: number; candles: Candle[]; traders: Trader[]; fills: Fill[] };

const VISIBLE = 44;
const TICK_MS = 320;
const TICKS_PER_CANDLE = 4;
const TRADE_EVERY = 6;
/** Only the latest fills are pinned to the chart, so it reads as trades, not confetti. */
const MARKERS = 6;
const START = 10_000;
const ROUND_SECONDS = 2 * 3600 - 17 * 60;
const UP = "#12a150";
const DOWN = "#e5484d";
/** Green long, red short, grey close. */
const TONE = { long: UP, short: DOWN, close: "#9aa1ad" } as const;

const ROSTER: [string, string][] = [
  ["alex", "#7c6bff"],
  ["maya", "#e59bd8"],
  ["you", "#0b0e15"],
  ["ryan", "#3b82f6"],
  ["nora", "#f59e0b"],
  ["ben", "#14b8a6"],
];

/** A small deterministic generator, so the server's first frame and the browser's are the same. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function advance(state: State, random: () => number): State {
  const tick = state.tick + 1;
  const candles = state.candles.slice();
  const last = candles[candles.length - 1] as Candle;
  const drift = Math.sin(tick / 37) * 0.0003;
  const c = last.c * (1 + drift + (random() - 0.5) * 0.0042);
  candles[candles.length - 1] = { ...last, c, h: Math.max(last.h, c), l: Math.min(last.l, c) };
  let first = state.first;
  if (tick % TICKS_PER_CANDLE === 0) {
    candles.push({ o: c, h: c, l: c, c });
    if (candles.length > VISIBLE) {
      candles.shift();
      first += 1;
    }
  }
  if (tick % TRADE_EVERY !== 0) {
    return { ...state, tick, first, candles };
  }
  const index = Math.floor(random() * state.traders.length);
  const traders = state.traders.map((t) => ({ ...t }));
  const t = traders[index] as Trader;
  const trend = c - (candles[Math.max(0, candles.length - 6)] as Candle).o;
  const wantsLong = random() < (trend > 0 ? 0.62 : 0.38);
  let fill: Omit<Fill, "id" | "who" | "hue" | "at" | "price">;
  if (t.size !== 0 && (random() < 0.4 || t.size > 0 !== wantsLong)) {
    fill = { action: "close", size: Math.abs(t.size) };
    t.realized += t.size * (c - t.entry);
    t.size = 0;
  } else {
    const size = Math.round(2 + random() * 12);
    const signed = wantsLong ? size : -size;
    t.entry = t.size === 0 ? c : (t.entry * t.size + c * signed) / (t.size + signed);
    t.size += signed;
    fill = { action: wantsLong ? "long" : "short", size };
  }
  const entry: Fill = {
    ...fill,
    id: tick,
    who: t.name,
    hue: t.hue,
    price: c,
    at: first + candles.length - 1,
  };
  return { tick, first, candles, traders, fills: [entry, ...state.fills].slice(0, 12) };
}

function initial(): State {
  const random = seeded(31);
  let state: State = {
    tick: 0,
    first: 0,
    candles: [{ o: 2418, h: 2418, l: 2418, c: 2418 }],
    traders: ROSTER.map(([name, hue]) => ({ name, hue, size: 0, entry: 0, realized: 0 })),
    fills: [],
  };
  while (state.candles.length < VISIBLE || state.tick < 260) {
    state = advance(state, random);
  }
  return state;
}

const roiOf = (t: Trader, price: number) => (t.realized + t.size * (price - t.entry)) / START;

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clock = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

export function HeroCanvas() {
  const [state, setState] = useState(initial);
  const still = useReducedMotion();

  useEffect(() => {
    if (still) {
      return;
    }
    const id = setInterval(() => {
      if (!document.hidden) {
        setState((s) => advance(s, Math.random));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [still]);

  const price = (state.candles[state.candles.length - 1] as Candle).c;
  const open = (state.candles[0] as Candle).o;
  const change = (price - open) / open;
  const board = state.traders
    .map((t) => ({ ...t, roi: roiOf(t, price) }))
    .sort((a, b) => b.roi - a.roi);
  const left = Math.max(0, ROUND_SECONDS - Math.floor((state.tick * TICK_MS) / 1000));

  return (
    <div className="relative isolate overflow-hidden rounded-[24px] border border-[var(--color-border)] shadow-[0_40px_80px_-50px_rgba(20,28,60,0.5)]">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(120% 90% at 15% 10%, #dbe8ff 0%, #9dbbff 30%, #7c6bff 62%, #e59bd8 100%)",
          opacity: 0.95,
        }}
      />
      <div className="relative px-3 pt-3 sm:px-10 sm:pt-10 lg:px-12 lg:pt-12">
        <div
          className="overflow-hidden rounded-t-[14px] border border-b-0 border-[var(--color-border)] bg-[var(--color-paper)] text-[var(--color-ink)] shadow-[0_-24px_50px_-30px_rgba(20,28,60,0.32)]"
          role="img"
          aria-label="A simulated futures round: an ETH candle chart with traders' fills, and a leaderboard that re-ranks as the price moves"
        >
          <Header price={price} change={change} left={left} />
          <div className="grid lg:grid-cols-12">
            <div className="border-[var(--color-border)] lg:col-span-8 lg:border-r">
              <Chart state={state} price={price} />
            </div>
            <div className="flex flex-col lg:col-span-4">
              <Board board={board} />
              <Feed fills={state.fills} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ price, change, left }: { price: number; change: number; left: number }) {
  const up = change >= 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-[#627eea] text-[13px] font-semibold text-white">
          Ξ
        </span>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold">ETH-PERP</div>
          <div className="text-[11px] text-[var(--color-ink-3)]">
            Campus Club · round #31 · Pyth
          </div>
        </div>
      </div>
      <div className="flex items-baseline gap-2 font-mono tabular-nums">
        <span className="text-[18px] font-semibold">${money(price)}</span>
        <span className="text-[12px]" style={{ color: up ? UP : DOWN }}>
          {up ? "▲" : "▼"} {(Math.abs(change) * 100).toFixed(2)}%
        </span>
      </div>
      <div className="hidden items-center gap-2 text-[11px] text-[var(--color-ink-2)] sm:flex">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#12a150] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[#12a150]" />
        </span>
        <span className="font-mono tabular-nums">ends in {clock(left)}</span>
      </div>
    </div>
  );
}

const GAP = 10;

function Chart({ state, price }: { state: State; price: number }) {
  const { candles, first, fills } = state;
  const high = Math.max(...candles.map((c) => c.h));
  const low = Math.min(...candles.map((c) => c.l));
  const pad = (high - low) * 0.12 || 1;
  const top = high + pad;
  const bottom = low - pad;
  const y = (p: number) => ((top - p) / (top - bottom)) * 100;
  const x = (i: number) => ((i * GAP + GAP / 2) / (VISIBLE * GAP)) * 100;
  const grid = [0.2, 0.4, 0.6, 0.8].map((f) => top - (top - bottom) * f);
  const last = candles[candles.length - 1] as Candle;
  const lastUp = last.c >= last.o;
  return (
    <div className="relative h-[240px] pr-16 sm:h-[340px] lg:h-[400px]">
      <div className="relative h-full">
        <svg
          viewBox={`0 0 ${VISIBLE * GAP} 100`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {grid.map((p) => (
            <line
              key={p}
              x1={0}
              x2={VISIBLE * GAP}
              y1={y(p)}
              y2={y(p)}
              stroke="rgba(11,14,21,0.06)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={0}
            x2={VISIBLE * GAP}
            y1={y(price)}
            y2={y(price)}
            stroke={lastUp ? UP : DOWN}
            strokeDasharray="3 3"
            strokeOpacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
          {candles.map((c, i) => {
            const color = c.c >= c.o ? UP : DOWN;
            const bodyTop = y(Math.max(c.o, c.c));
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: offset by `first`, the key is the candle's place in the whole round, stable as the window scrolls
              <g key={first + i}>
                <line
                  x1={i * GAP + GAP / 2}
                  x2={i * GAP + GAP / 2}
                  y1={y(c.h)}
                  y2={y(c.l)}
                  stroke={color}
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={i * GAP + 2}
                  width={GAP - 4}
                  y={bodyTop}
                  height={Math.max(0.5, y(Math.min(c.o, c.c)) - bodyTop)}
                  fill={color}
                  rx={0.6}
                />
              </g>
            );
          })}
        </svg>
        <AnimatePresence>
          {fills
            .slice(0, MARKERS)
            .filter((f) => f.at >= first)
            .map((f) => (
              <motion.span
                key={f.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1.4, 0.36, 1] }}
                className="absolute grid size-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[9px] font-semibold text-white"
                style={{
                  left: `${x(f.at - first)}%`,
                  top: `${y(f.price)}%`,
                  background: f.hue,
                  boxShadow: `0 0 0 2px ${TONE[f.action]}`,
                }}
              >
                {f.who[0]?.toUpperCase()}
              </motion.span>
            ))}
        </AnimatePresence>
      </div>
      <div className="absolute inset-y-0 right-0 w-16 font-mono text-[10px] tabular-nums text-[var(--color-ink-3)]">
        {grid.map((p) => (
          <span key={p} className="absolute left-2 -translate-y-1/2" style={{ top: `${y(p)}%` }}>
            {p.toFixed(1)}
          </span>
        ))}
        <span
          className="absolute left-1 -translate-y-1/2 rounded px-1 py-0.5 text-white"
          style={{ top: `${y(price)}%`, background: lastUp ? UP : DOWN }}
        >
          {price.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function Board({ board }: { board: (Trader & { roi: number })[] }) {
  return (
    <div className="border-t border-[var(--color-border)] px-4 py-3 sm:px-5 lg:border-t-0">
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
        <span>Leaderboard</span>
        <span>Return</span>
      </div>
      <ol className="flex list-none flex-col gap-1 p-0">
        {board.map((t, i) => {
          const me = t.name === "you";
          return (
            <motion.li
              key={t.name}
              layout
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] ${me ? "bg-[rgba(124,107,255,0.1)]" : ""} ${i > 3 ? "hidden sm:flex" : ""}`}
            >
              <span className="w-4 font-mono text-[11px] text-[var(--color-ink-3)]">{i + 1}</span>
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: t.hue }}
              >
                {t.name[0]?.toUpperCase()}
              </span>
              <span className={`flex-1 truncate ${me ? "font-semibold" : ""}`}>{t.name}</span>
              <span className="font-mono text-[10px] text-[var(--color-ink-3)]">
                {t.size === 0 ? "flat" : `${t.size > 0 ? "L" : "S"} ${Math.abs(t.size)}`}
              </span>
              <span
                className="w-16 text-right font-mono text-[12px] tabular-nums"
                style={{ color: t.roi >= 0 ? UP : DOWN }}
              >
                {t.roi >= 0 ? "+" : "−"}
                {(Math.abs(t.roi) * 100).toFixed(2)}%
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

const VERB = { long: "longed", short: "shorted", close: "closed" } as const;

function Feed({ fills }: { fills: Fill[] }) {
  return (
    <div className="hidden flex-1 border-t border-[var(--color-border)] px-5 py-3 lg:block">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
        Fills
      </div>
      <ul className="flex list-none flex-col gap-1.5 p-0">
        <AnimatePresence initial={false}>
          {fills.slice(0, 5).map((f) => (
            <motion.li
              key={f.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="size-1.5 rounded-full" style={{ background: f.hue }} />
              <span className="font-medium">{f.who}</span>
              <span style={{ color: TONE[f.action] }}>
                {VERB[f.action]} {f.size} ETH
              </span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-[var(--color-ink-3)]">
                {money(f.price)}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
