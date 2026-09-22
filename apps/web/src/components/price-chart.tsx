"use client";

import { areaPath, type Bar, type ChartType, candleShapes, linePath, plotOf } from "@/lib/chart.ts";
import { useChartViewport } from "@/lib/use-chart-viewport.ts";

const FRAME = { width: 335, height: 240, padY: 28, padX: 8 };

const price = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 6 : 2 });

interface Props {
  /** Uniformly spaced bars, oldest first. More than fit: the viewport picks the window. */
  readonly bars: readonly Bar[];
  readonly type: ChartType;
}

function Candles({ bars, plot }: { bars: readonly Bar[]; plot: ReturnType<typeof plotOf> }) {
  return candleShapes(bars, plot, FRAME).map((shape) => (
    <g key={shape.time} className={shape.up ? "fill-up stroke-up" : "fill-down stroke-down"}>
      <line x1={shape.x} x2={shape.x} y1={shape.wickTop} y2={shape.wickBottom} strokeWidth={1.2} />
      <rect
        x={shape.x - shape.width / 2}
        y={shape.bodyTop}
        width={shape.width}
        height={shape.bodyHeight}
        rx={1}
        stroke="none"
      />
    </g>
  ));
}

/**
 * Line, candles or area from the same bars, with the gestures of a trading terminal: wheel or pinch to
 * zoom, drag to look back, double tap to return to now. Pure SVG: the geometry comes from `lib/chart.ts`.
 */
export function PriceChart({ bars, type }: Props) {
  const viewport = useChartViewport(bars.length, FRAME.width);
  const end = bars.length - viewport.offset;
  const shown = bars.slice(Math.max(0, end - viewport.visible), end);
  const first = shown[0];
  const last = shown.at(-1);
  if (!(first && last)) {
    return (
      <div className="grid h-60 place-items-center rounded-2xl bg-surface-raised text-sm font-medium text-ink-muted">
        No trades in this range yet
      </div>
    );
  }
  const plot = plotOf(shown, first.time, last.time, FRAME);
  const high = shown.reduce((best, bar) => (bar.high > best.high ? bar : best));
  const low = shown.reduce((best, bar) => (bar.low < best.low ? bar : best));
  const lastY = plot.y(last.close);
  // Callouts flip to the other side of their point near the right edge, so they never clip.
  const anchor = (x: number) => (x > FRAME.width - 70 ? "end" : "start");

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
        role="img"
        aria-label={`Price from ${price(low.low)} to ${price(high.high)}, last ${price(last.close)}. ${viewport.visible} candles shown.`}
        className="w-full cursor-grab touch-none select-none overflow-visible active:cursor-grabbing"
        {...viewport.handlers}
      >
        {[0.25, 0.5, 0.75].map((step) => (
          <line
            key={step}
            x1={0}
            x2={FRAME.width}
            y1={FRAME.height * step}
            y2={FRAME.height * step}
            className="stroke-border"
            strokeWidth={1}
          />
        ))}

        {type === "Area" ? (
          <>
            <defs>
              <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaPath(shown, plot, last.time, FRAME)} fill="url(#area-fill)" />
          </>
        ) : null}

        {type === "Candles" ? (
          <Candles bars={shown} plot={plot} />
        ) : (
          <path
            d={linePath(shown, plot, last.time)}
            fill="none"
            className="stroke-ink"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        <line
          x1={0}
          x2={FRAME.width}
          y1={lastY}
          y2={lastY}
          className="stroke-ink-muted"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <circle
          cx={plot.x(last.time)}
          cy={lastY}
          r={3.5}
          className="fill-surface stroke-ink"
          strokeWidth={2}
        />

        <g className="tabular fill-ink font-mono text-[10px] font-bold">
          <text
            x={plot.x(high.time)}
            y={plot.y(high.high) - 8}
            textAnchor={anchor(plot.x(high.time))}
          >
            {price(high.high)}
          </text>
          <text x={plot.x(low.time)} y={plot.y(low.low) + 16} textAnchor={anchor(plot.x(low.time))}>
            {price(low.low)}
          </text>
        </g>
      </svg>
      {viewport.zoomed ? (
        <button
          type="button"
          onClick={viewport.reset}
          className="absolute right-0 top-0 rounded-full bg-ink px-2.5 py-1 font-mono text-[11px] font-bold text-white shadow-button transition duration-200 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {viewport.offset > 0 ? "Back to now" : `${viewport.visible} candles · reset`}
        </button>
      ) : null}
    </div>
  );
}
