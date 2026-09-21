import { notFound } from "next/navigation";

import { TournamentDetail } from "@/components/tournament-detail.tsx";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    notFound();
  }
  return <TournamentDetail id={id} />;
}
