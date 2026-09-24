import { type NextRequest, NextResponse } from "next/server";

import { roomId } from "@/lib/room-code.ts";
import { isPossibleRoute } from "@/lib/route-shape.ts";

/**
 * A link that cannot point at anything is answered 404 here, before rendering. The pages' own `notFound()`
 * runs inside a streamed response, whose status is already 200 by then.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // A room code is a redirect, and a real one: the QR on a host's screen should not render a page first.
  const [, head, code] = pathname.split("/");
  const room = head === "r" && code ? roomId(decodeURIComponent(code)) : null;
  if (room !== null) {
    return NextResponse.redirect(publicUrl(request, `/t/${room}`));
  }
  if (isPossibleRoute(pathname)) {
    return NextResponse.next();
  }
  // No route answers this path, so Next renders the app's not-found page with a 404.
  const missing = request.nextUrl.clone();
  missing.pathname = "/404";
  return NextResponse.rewrite(missing);
}

/**
 * `path` on the host the browser asked for. Behind nginx the server's own URL is internal, so the address comes
 * from the Host and X-Forwarded-Proto headers nginx sets. The host only ever sends a caller back to itself.
 */
function publicUrl(request: NextRequest, path: string): URL {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}

export const config = {
  matcher: ["/t/:path*", "/r/:path*"],
};
