import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HostScreen } from "@/components/host-screen.tsx";

export const metadata: Metadata = { title: "Big screen" };

/** The projector view of a game: code and QR, lobby, live table, podium. */
export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    notFound();
  }
  return <HostScreen id={id} />;
}
