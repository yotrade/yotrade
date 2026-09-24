import { phaseAt } from "@yotrade/plugin-tournament/phase";
import { NextResponse } from "next/server";

import { isLanguage } from "@/lib/languages.ts";
import { readProfiles } from "@/lib/profile.ts";
import { parseServerEnv } from "@/lib/server-env.ts";
import { createCommentator, factsOf } from "@/server/commentary.ts";
import { getLeaderboard } from "@/server/leaderboard.ts";
import { serverRuntime } from "@/server/runtime.ts";

export const dynamic = "force-dynamic";

function createCommentary() {
  const env = parseServerEnv({
    KIMI_API_KEY: process.env["KIMI_API_KEY"],
    KIMI_BASE_URL: process.env["KIMI_BASE_URL"],
    KIMI_MODEL: process.env["KIMI_MODEL"],
  });
  return env.KIMI_API_KEY
    ? createCommentator({
        apiKey: env.KIMI_API_KEY,
        baseUrl: env.KIMI_BASE_URL,
        model: env.KIMI_MODEL,
      })
    : null;
}

let commentator: ReturnType<typeof createCommentary> | undefined;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const language = new URL(request.url).searchParams.get("lang") ?? "en";
  if (!(/^[1-9]\d{0,18}$/.test(id) && isLanguage(language))) {
    return NextResponse.json({ error: "Unknown tournament or language" }, { status: 404 });
  }
  commentator ??= createCommentary();
  if (!commentator) {
    // Not an error for the visitor: the card simply stays hidden, and the browser console stays clean.
    return NextResponse.json({ text: null });
  }
  try {
    const board = await getLeaderboard(BigInt(id));
    if (!board) {
      return NextResponse.json({ error: "Unknown tournament" }, { status: 404 });
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    const top = board.rows.slice(0, 10).map((row) => row.participant);
    const profiles = await readProfiles(serverRuntime().publicClient, top).catch(() => null);
    const names = new Map(
      [...(profiles ?? new Map())].map(([account, profile]) => [account, profile.name]),
    );
    const facts = factsOf(board, phaseAt(board.tournament, now), now, names);
    const { text, generatedAt } = await commentator(id, facts, language);
    return NextResponse.json({ text, generatedAt });
  } catch {
    return NextResponse.json(
      { error: "The commentator is catching their breath" },
      { status: 502 },
    );
  }
}
