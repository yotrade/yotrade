"use client";

import { type PointerEvent as ReactPointerEvent, type WheelEvent, useRef, useState } from "react";

import { CANDLES } from "./chart.ts";

const MIN_VISIBLE = 16;

export interface Viewport {
  /** Bars on screen. */
  readonly visible: number;
  /** Bars hidden to the right of the screen, when panned back in time. */
  readonly offset: number;
  readonly zoomed: boolean;
  reset(): void;
  /** Attach to the drawing surface. Wheel and pinch zoom, drag pans, double tap resets. */
  readonly handlers: {
    onWheel(event: WheelEvent<SVGSVGElement>): void;
    onPointerDown(event: ReactPointerEvent<SVGSVGElement>): void;
    onPointerMove(event: ReactPointerEvent<SVGSVGElement>): void;
    onPointerUp(event: ReactPointerEvent<SVGSVGElement>): void;
    onDoubleClick(): void;
  };
}

/**
 * The window of bars a chart shows, the way a trading terminal moves it: a wheel or pinch changes how many
 * bars fit, a drag slides through time, a double tap comes back to now. Nothing here touches the data.
 */
export function useChartViewport(total: number, width: number): Viewport {
  const [visible, setVisible] = useState(CANDLES);
  const [offset, setOffset] = useState(0);
  const pointers = useRef(new Map<number, number>());
  const pinch = useRef<{ distance: number; visible: number } | null>(null);
  const drag = useRef<{ x: number; offset: number } | null>(null);

  const clampVisible = (next: number) => Math.round(Math.min(Math.max(next, MIN_VISIBLE), Math.max(total, MIN_VISIBLE)));
  const clampOffset = (next: number, shown: number) => Math.round(Math.min(Math.max(next, 0), Math.max(total - shown, 0)));

  function zoom(factor: number) {
    const next = clampVisible(visible * factor);
    setVisible(next);
    setOffset((current) => clampOffset(current, next));
  }

  function reset() {
    setVisible(clampVisible(CANDLES));
    setOffset(0);
  }

  return {
    visible: clampVisible(visible),
    offset: clampOffset(offset, clampVisible(visible)),
    zoomed: clampVisible(visible) !== clampVisible(CANDLES) || offset !== 0,
    reset,
    handlers: {
      onWheel(event) {
        // Vertical wheel zooms, horizontal wheel (a trackpad) pans. The page must not scroll under it.
        if (Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
          zoom(event.deltaY > 0 ? 1.15 : 1 / 1.15);
        } else {
          setOffset((current) => clampOffset(current - Math.sign(event.deltaX) * 2, visible));
        }
      },
      onPointerDown(event) {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, event.clientX);
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinch.current = { distance: Math.abs((a ?? 0) - (b ?? 0)) || 1, visible };
          drag.current = null;
        } else {
          drag.current = { x: event.clientX, offset };
        }
      },
      onPointerMove(event) {
        if (!pointers.current.has(event.pointerId)) {
          return;
        }
        pointers.current.set(event.pointerId, event.clientX);
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          const distance = Math.abs((a ?? 0) - (b ?? 0)) || 1;
          const next = clampVisible(pinch.current.visible * (pinch.current.distance / distance));
          setVisible(next);
          setOffset((current) => clampOffset(current, next));
          return;
        }
        if (drag.current) {
          const perBar = width / visible;
          const moved = (event.clientX - drag.current.x) / perBar;
          setOffset(clampOffset(drag.current.offset + moved, visible));
        }
      },
      onPointerUp(event) {
        pointers.current.delete(event.pointerId);
        if (pointers.current.size < 2) {
          pinch.current = null;
        }
        if (pointers.current.size === 0) {
          drag.current = null;
        }
      },
      onDoubleClick: reset,
    },
  };
}
