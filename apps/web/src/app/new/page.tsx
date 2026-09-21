import type { Metadata } from "next";
import Link from "next/link";

import { CreateForm } from "@/components/create-form.tsx";

export const metadata: Metadata = { title: "Host a tournament" };

export default function NewTournamentPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 py-8">
      <Link href="/" className="text-sm text-ink-muted hover:text-ink">
        ← All tournaments
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-tight">Host a tournament</h1>
        <p className="text-ink-muted">Set the prize, pick a schedule, share the link.</p>
      </header>
      <CreateForm />
    </main>
  );
}
