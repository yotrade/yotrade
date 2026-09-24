import type { Metadata } from "next";

import { CreateForm } from "@/components/create-form.tsx";
import { type CreateForm as Form, rematchForm } from "@/lib/create.ts";
import { publicEnv } from "@/lib/env.ts";
import { createIndexer } from "@/lib/indexer.ts";

export const metadata: Metadata = { title: "Host a tournament" };

const ID = /^[1-9]\d{0,18}$/;

/** `?from=<id>`: the form filled in from that tournament, for the next game of a series. */
async function rematchOf(from: string | undefined): Promise<Form | undefined> {
  if (!(from && ID.test(from))) {
    return undefined;
  }
  try {
    const played = await createIndexer(publicEnv.NEXT_PUBLIC_INDEXER_URL).tournament(BigInt(from));
    return played ? rematchForm(played) : undefined;
  } catch {
    // An indexer hiccup costs the prefill, never the page.
    return undefined;
  }
}

export default async function NewTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const initial = await rematchOf((await searchParams).from);
  return (
    <main className="flex flex-1 flex-col pt-4">
      <CreateForm {...(initial ? { initial } : {})} />
    </main>
  );
}
