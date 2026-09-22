import { NextResponse } from "next/server";

import { createLogoProxy, LogoError } from "@/server/logo.ts";

let proxy: ReturnType<typeof createLogoProxy> | undefined;

/** `GET /api/logo?url=https://…`. Same-origin images: no tracking of viewers, no hotlink refusals. */
export async function GET(request: Request) {
  proxy ??= createLogoProxy({
    blocklist: (process.env["LOGO_BLOCKLIST"] ?? "").split(",").map((part) => part.trim()),
  });
  const url = new URL(request.url).searchParams.get("url") ?? "";
  try {
    const logo = await proxy(url);
    return new Response(logo.body, {
      headers: {
        "content-type": logo.contentType,
        "x-content-type-options": "nosniff",
        // An SVG in an <img> cannot run scripts; the sandbox covers a direct visit to this URL as well.
        "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800, max-age=3600",
      },
    });
  } catch (cause) {
    const status = cause instanceof LogoError ? cause.status : 502;
    return NextResponse.json({ error: "Logo unavailable" }, { status });
  }
}
