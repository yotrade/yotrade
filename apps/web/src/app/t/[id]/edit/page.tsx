import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EditTournamentScreen } from "@/components/edit-tournament-screen.tsx";

export const metadata: Metadata = { title: "Edit tournament" };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    notFound();
  }
  return <EditTournamentScreen id={id} />;
}
