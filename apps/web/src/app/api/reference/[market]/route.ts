import { NextResponse } from "next/server";

import { RANGES, type RangeName } from "@/lib/chart.ts";
import { isMarketSlug } from "@/lib/markets.ts";
import { isPerpsSlug } from "@/lib/perps-markets.ts";
import { createReference } from "@/server/reference.ts";

let reference: ReturnType<typeof createReference> | undefined;

export async function GET(request: Request, { params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  const range = new URL(request.url).searchParams.get("range") ?? "15m";
  if (!((isMarketSlug(market) || isPerpsSlug(market)) && Object.hasOwn(RANGES, range))) {
    return NextResponse.json({ error: "Unknown market or range" }, { status: 404 });
  }
  reference ??= createReference();
  try {
    return NextResponse.json(await reference(market, range as RangeName), {
      // Shared caches serve this for 30 s and keep serving it while they refresh in the background.
      headers: {
        "cache-control":
          range === "1s" || range === "1m"
            ? "public, s-maxage=3, stale-while-revalidate=10"
            : "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Reference prices are unavailable right now" },
      { status: 502 },
    );
  }
}
