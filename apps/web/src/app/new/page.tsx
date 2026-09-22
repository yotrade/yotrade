import type { Metadata } from "next";

import { CreateForm } from "@/components/create-form.tsx";

export const metadata: Metadata = { title: "Host a tournament" };

export default function NewTournamentPage() {
  return (
    <main className="flex flex-1 flex-col pt-4">
      <CreateForm />
    </main>
  );
}
