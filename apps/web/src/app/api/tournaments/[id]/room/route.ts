import { NextResponse } from "next/server";

import { getRoom } from "@/server/room.ts";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    return NextResponse.json({ error: "Unknown tournament" }, { status: 404 });
  }
  try {
    const room = await getRoom(BigInt(id));
    // Unknown, or not started yet: there is no round to show.
    if (!room) {
      return NextResponse.json({ error: "No room yet" }, { status: 404 });
    }
    return NextResponse.json(room);
  } catch {
    return NextResponse.json({ error: "The room is unavailable right now" }, { status: 502 });
  }
}
