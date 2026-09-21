import { NextResponse } from "next/server";
import { createWalletClient, custom, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { publicEnv } from "@/lib/env.ts";
import { createAppRuntime } from "@/lib/runtime.ts";
import { parseServerEnv } from "@/lib/server-env.ts";
import { venueOf } from "@/lib/venue.ts";
import { createFinalizer, type FinalizeResult } from "@/server/finalize.ts";
import { serverHermes } from "@/server/hermes-options.ts";
import { getLeaderboard } from "@/server/leaderboard.ts";

export const dynamic = "force-dynamic";

const HTTP_STATUS: Record<FinalizeResult["status"], number> = {
  posted: 200,
  "already-final": 409,
  "not-ended": 409,
  unknown: 404,
};

function createFinalize() {
  const key = parseServerEnv({
    SCORER_PRIVATE_KEY: process.env["SCORER_PRIVATE_KEY"],
  }).SCORER_PRIVATE_KEY;
  if (!key) {
    return null;
  }
  const runtime = createAppRuntime(publicEnv, serverHermes() ?? undefined);
  const wallet = createWalletClient({
    account: privateKeyToAccount(key as Hex),
    chain: runtime.chain,
    transport: custom(runtime.publicClient),
  });
  return createFinalizer({
    leaderboard: getLeaderboard,
    // Simulated before it is sent, so a tournament that was finalized a moment ago costs no gas.
    postResults: (id, winners) => runtime.tournament.postResults(wallet, id, winners),
    async settle({ tournament }) {
      if (venueOf(tournament.venue) !== "futures") {
        return;
      }
      // One at a time: Monad wants each receipt before the next transaction from the same account.
      for (const entry of tournament.entries) {
        await runtime.perps.settle(wallet, {
          tournamentId: tournament.id,
          trader: entry.tradingAccount,
          endTime: tournament.endTime,
        });
      }
    },
  });
}

let finalize: ReturnType<typeof createFinalize> | undefined;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    return NextResponse.json({ status: "unknown" }, { status: 404 });
  }
  finalize ??= createFinalize();
  if (!finalize) {
    return NextResponse.json({ error: "Scoring is not configured" }, { status: 503 });
  }
  try {
    const result = await finalize(BigInt(id));
    return NextResponse.json(result, { status: HTTP_STATUS[result.status] });
  } catch {
    // Most often the indexer has not caught up with a result posted seconds ago.
    return NextResponse.json(
      { error: "Results could not be posted. Try again shortly." },
      { status: 502 },
    );
  }
}
