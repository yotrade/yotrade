import { NextResponse } from "next/server";

import type { LeaderboardRow } from "@/lib/leaderboard-row.ts";
import { getLeaderboard } from "@/server/leaderboard.ts";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    return NextResponse.json({ error: "Unknown tournament" }, { status: 404 });
  }
  try {
    const board = await getLeaderboard(BigInt(id));
    if (!board) {
      return NextResponse.json({ error: "Unknown tournament" }, { status: 404 });
    }
    const rows: LeaderboardRow[] = board.rows.map((row, index) => ({
      rank: index + 1,
      participant: row.participant,
      pnl: row.pnl.toString(),
      roiPpm: row.roiPpm,
      fills: row.fills,
    }));
    return NextResponse.json({ rows, computedAt: board.computedAt });
  } catch {
    return NextResponse.json({ error: "Scores are unavailable right now" }, { status: 502 });
  }
}
