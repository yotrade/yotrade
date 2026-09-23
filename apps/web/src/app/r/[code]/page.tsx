import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { roomId } from "@/lib/room-code.ts";

/** `/r/K7X2PQ`: what a QR code on the host's screen points at. */
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const id = roomId((await params).code);
  if (id === null) {
    notFound();
  }
  redirect(`/t/${id}` as Route);
}
