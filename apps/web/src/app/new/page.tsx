import type { Metadata } from "next";
import Link from "next/link";

import { CreateForm } from "@/components/create-form.tsx";
import { Icon } from "@/components/ui/icon.tsx";

export const metadata: Metadata = { title: "Host a tournament" };

export default function NewTournamentPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex flex-col gap-4">
        <Link
          href="/"
          aria-label="All tournaments"
          className="grid size-10 place-items-center rounded-full bg-well hover:bg-border focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold leading-tight tracking-tight">Host a tournament</h1>
          <p className="text-sm font-medium text-ink-muted">
            Set the prize, pick a schedule, share the link.
          </p>
        </div>
      </header>
      <CreateForm />
    </main>
  );
}
