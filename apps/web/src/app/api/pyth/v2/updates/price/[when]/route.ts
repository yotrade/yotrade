import { NextResponse } from "next/server";

import { parseServerEnv } from "@/lib/server-env.ts";
import { createPythProxy, type PythProxy, PythProxyError } from "@/server/pyth.ts";

let proxy: PythProxy | null | undefined;

/** Same path and query as Hermes, so the client only swaps its base URL. */
export async function GET(request: Request, { params }: { params: Promise<{ when: string }> }) {
  if (proxy === undefined) {
    const env = parseServerEnv(process.env);
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
        "cache-control":
          when === "latest"
            ? "public, s-maxage=1, stale-while-revalidate=2"
            : "public, s-maxage=3600, immutable",
      },
    });
  } catch (cause) {
    const status = cause instanceof PythProxyError ? cause.status : 502;
    return NextResponse.json({ error: "Prices are unavailable right now" }, { status });
  }
}
