import type { Phase } from "@yotrade/plugin-tournament/phase";

import { clock } from "./screen.ts";

type Mine = { readonly rank: number; readonly fills: number } | undefined;

/** Where you stand: a rank once you have traded, a dash before and when you are not in. */
export function rankText(mine: Mine): string {
  return mine && mine.fills > 0 ? `#${mine.rank}` : "—";
}

/** The label over the rank: the field size, or the nudge to get on the board. */
export function rankLabel(mine: Mine, players: number): string {
  if (mine && mine.fills === 0) {
    return "Trade to rank";
  }
  return players > 0 ? `Rank of ${players}` : "Rank";
}

/** The clock a player cares about in this phase. */
export function timeText(
  phase: Phase,
  schedule: { readonly startTime: bigint; readonly endTime: bigint } | null,
  now: bigint,
): string {
  if (!schedule) {
    return "—";
  }
  if (phase === "live") {
    return clock(schedule.endTime - now);
  }
  if (phase === "upcoming") {
    return `in ${clock(schedule.startTime - now)}`;
  }
  return "Ended";
}

/** Green up, red down, plain when there is nothing yet. */
export function returnTone(bps: number | null): string {
  if (bps === null) {
    return "";
  }
  return bps >= 0 ? "text-[#7ce7a3]" : "text-[#ff8a8a]";
}
