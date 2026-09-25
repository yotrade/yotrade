import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * A spot round in motion: a MON/USDC candle chart on Kuru's book, a handful of traders buying in and
 * selling out on it, and the board re-ranking with every tick. A simulation: the rules are the app's (the
 * same capital for everyone, return on capital, the same book for all), the traders and prices are not.
 */

type Candle = { o: number; h: number; l: number; c: number };
type Trader = { name: string; avatar: string; size: number; entry: number; realized: number };
type Fill = {
  id: number;
  who: string;
  avatar: string;
  action: "buy" | "sell";
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
/** Green buy, red sell. */
const TONE = { buy: UP, sell: DOWN } as const;
/** A buy is 40k to 160k MON, in thousands: about $1,000 to $4,000 at the round's prices. */
const LOT_MIN = 40;
const LOT_MAX = 160;
/** MON trades at a few cents, so prices carry five decimals. */
const DECIMALS = 5;

/** The app's own avatars, served from public/app/. */
const ROSTER: [string, string][] = [
  ["alex", "/app/avatars/1.png"],
  ["maya", "/app/avatars/2.png"],
  ["you", "/app/avatars/3.png"],
  ["ryan", "/app/avatars/4.png"],
  ["nora", "/app/avatars/5.png"],
  ["ben", "/app/avatars/6.png"],
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
  const wantsIn = random() < (trend > 0 ? 0.62 : 0.38);
  let fill: Omit<Fill, "id" | "who" | "avatar" | "at" | "price">;
  // Spot has no shorts: a trader buys in, and sells out of what they hold.
  if (t.size > 0 && (random() < 0.4 || !wantsIn)) {
    fill = { action: "sell", size: t.size };
    t.realized += t.size * (c - t.entry);
    t.size = 0;
  } else if (wantsIn && (t.size + LOT_MAX) * c <= START) {
    const size = Math.round(LOT_MIN + random() * (LOT_MAX - LOT_MIN)) * 1_000;
    t.entry = (t.entry * t.size + c * size) / (t.size + size);
    t.size += size;
    fill = { action: "buy", size };
  } else {
    return { ...state, tick, first, candles };
  }
  const entry: Fill = {
    ...fill,
    id: tick,
    who: t.name,
    avatar: t.avatar,
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
    candles: [{ o: 0.0261, h: 0.0261, l: 0.0261, c: 0.0261 }],
    traders: ROSTER.map(([name, avatar]) => ({ name, avatar, size: 0, entry: 0, realized: 0 })),
    fills: [],
  };
  while (state.candles.length < VISIBLE || state.tick < 260) {
    state = advance(state, random);
  }
  return state;
}

const roiOf = (t: Trader, price: number) => (t.realized + t.size * (price - t.entry)) / START;

const money = (n: number) => n.toFixed(DECIMALS);

/** 120000 → "120k". */
const lot = (size: number) => `${Math.round(size / 1_000)}k`;

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
          aria-label="A simulated spot round: a MON/USDC candle chart with traders' fills, and a leaderboard that re-ranks as the price moves"
        >
          <Header price={price} change={change} left={left} />
          {/* A fixed height on wide screens: the sidebar never grows the frame, so the page never jumps. */}
          <div className="grid lg:h-[440px] lg:grid-cols-12">
            <div className="border-[var(--color-border)] lg:col-span-8 lg:border-r">
              <Chart state={state} price={price} />
            </div>
            <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-4">
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
    <div className="flex flex-col gap-2 border-b sm:flex-row sm:items-center sm:justify-between sm:gap-6 border-[var(--color-border)] px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <img src="/app/mon.png" alt="" width={32} height={32} className="size-8 rounded-full" />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold">MON/USDC</div>
          <div className="text-[11px] text-[var(--color-ink-3)]">
            Campus Club · round #31 · Kuru
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
    <div className="relative h-[240px] pr-16 sm:h-[340px] lg:h-full">
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
                className="absolute size-5 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-white"
                style={{
                  left: `${x(f.at - first)}%`,
                  top: `${y(f.price)}%`,
                  boxShadow: `0 0 0 2px ${TONE[f.action]}`,
                }}
              >
                <img src={f.avatar} alt="" width={20} height={20} className="size-full" />
              </motion.span>
            ))}
        </AnimatePresence>
      </div>
      <div className="absolute inset-y-0 right-0 w-16 font-mono text-[10px] tabular-nums text-[var(--color-ink-3)]">
        {grid.map((p) => (
          <span key={p} className="absolute left-2 -translate-y-1/2" style={{ top: `${y(p)}%` }}>
            {p.toFixed(DECIMALS)}
          </span>
        ))}
        <span
          className="absolute left-1 -translate-y-1/2 rounded px-1 py-0.5 text-white"
          style={{ top: `${y(price)}%`, background: lastUp ? UP : DOWN }}
        >
          {price.toFixed(DECIMALS)}
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
              <span className="grid w-4 place-items-center font-mono text-[11px] text-[var(--color-ink-3)]">
                {i === 0 ? (
                  <img src="/icons/crown-gold.svg" alt="1" width={14} height={14} />
                ) : (
                  i + 1
                )}
              </span>
              <img
                src={t.avatar}
                alt=""
                width={24}
                height={24}
                className="size-6 shrink-0 rounded-full bg-white"
              />
              <span className={`flex-1 truncate ${me ? "font-semibold" : ""}`}>{t.name}</span>
              <span className="font-mono text-[10px] text-[var(--color-ink-3)]">
                {sideText(t.size)}
              </span>
              <span
                className="w-16 text-right font-mono text-[12px] tabular-nums"
                style={{ color: t.roi >= 0 ? UP : DOWN }}
              >
                {roiText(t.roi)}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

const sideText = (size: number) => (size === 0 ? "flat" : lot(size));

const roiText = (roi: number) => `${roi >= 0 ? "+" : "−"}${(Math.abs(roi) * 100).toFixed(2)}%`;

const VERB = { buy: "bought", sell: "sold" } as const;

function Feed({ fills }: { fills: Fill[] }) {
  return (
    <div className="hidden min-h-0 flex-1 overflow-hidden border-t border-[var(--color-border)] px-5 py-3 lg:block">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
        Fills
      </div>
      <ul className="flex list-none flex-col gap-1.5 p-0">
        {/* popLayout takes a leaving fill out of the flow at once, so the list never holds six. */}
        <AnimatePresence initial={false} mode="popLayout">
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
              <img src={f.avatar} alt="" width={16} height={16} className="size-4 rounded-full" />
              <span className="font-medium">{f.who}</span>
              <span style={{ color: TONE[f.action] }}>
                {VERB[f.action]} {lot(f.size)} MON
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
