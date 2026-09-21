import Image from "next/image";
import Link from "next/link";

import { PasskeyCard } from "@/components/passkey-card.tsx";
import { TournamentList } from "@/components/tournament-list.tsx";
import { Card } from "@/components/ui/card.tsx";

const STEPS = [
  { title: "Join with a passkey", body: "One tap. No wallet, no seed phrase." },
  {
    title: "Trade real markets",
    body: "Same starting capital for everyone, on Kuru's onchain order book.",
  },
  { title: "Climb the leaderboard", body: "Scores anyone can verify. Prizes paid by a contract." },
] as const;

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col gap-8 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* The mark is yellow: it needs a dark tile to stay readable on a light canvas. */}
          <span className="grid size-12 place-items-center rounded-2xl bg-ink">
            <Image src="/icon-512.png" alt="" width={34} height={34} priority />
          </span>
          <p className="text-sm font-medium uppercase tracking-widest text-accent">YoTrade</p>
        </div>
        <h1 className="text-4xl font-bold leading-tight">
          Who&apos;s the best trader in your community?
        </h1>
        <p className="text-lg text-ink-muted">
          Host a live trading tournament on Monad and find out.
        </p>
      </header>

      <PasskeyCard />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Tournaments</h2>
          <Link href="/new" className="text-sm font-semibold text-accent hover:brightness-110">
            Host one →
          </Link>
        </div>
        <TournamentList />
      </section>

      <ol className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Card className="flex gap-4">
              <span className="tabular text-2xl font-bold text-accent">{index + 1}</span>
              <div>
                <h2 className="font-semibold">{step.title}</h2>
                <p className="text-sm text-ink-muted">{step.body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </main>
  );
}
