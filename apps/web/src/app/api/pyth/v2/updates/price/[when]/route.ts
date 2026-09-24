import { NextResponse } from "next/server";

import { parseServerEnv } from "@/lib/server-env.ts";
import { createPythProxy, type PythProxy, PythProxyError } from "@/server/pyth.ts";

let proxy: PythProxy | null | undefined;

/** Same path and query as Hermes, so the client only swaps its base URL. */
export async function GET(request: Request, { params }: { params: Promise<{ when: string }> }) {
  if (proxy === undefined) {
    // Only this route's own variables: an unrelated malformed one must not take futures prices down.
    const env = parseServerEnv({
      PYTH_API_KEY: process.env["PYTH_API_KEY"],
      PYTH_HERMES_URL: process.env["PYTH_HERMES_URL"],
    });
    proxy = env.PYTH_API_KEY
      ? createPythProxy({ baseUrl: env.PYTH_HERMES_URL, apiKey: env.PYTH_API_KEY })
      : null;
  }
  if (!proxy) {
    return NextResponse.json({ error: "Futures prices are not configured" }, { status: 503 });
  }
  const { when } = await params;
  try {
    const body = await proxy.get(when, new URL(request.url).searchParams.getAll("ids[]"));
    return new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, s-maxage=1, stale-while-revalidate=2",
      },
    });
  } catch (cause) {
    const status = cause instanceof PythProxyError ? cause.status : 502;
    return NextResponse.json({ error: "Prices are unavailable right now" }, { status });
  }
}
