import Image from "next/image";
import Link from "next/link";

import { AccountCard } from "@/components/account-card.tsx";
import { TournamentList } from "@/components/tournament-list.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Icon, type IconName } from "@/components/ui/icon.tsx";
import { SectionLabel } from "@/components/ui/section-label.tsx";

const STEPS: readonly { icon: IconName; title: string; body: string }[] = [
  { icon: "face-scan", title: "Join with a passkey", body: "One tap. No wallet, no seed phrase." },
  {
    icon: "swap",
    title: "Trade real markets",
    body: "Same starting capital, on Kuru's order book.",
  },
  {
    icon: "crown",
    title: "Climb the leaderboard",
    body: "Scores anyone can verify. Prizes paid by a contract.",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col gap-6 pb-10">
      <header className="flex items-center gap-3 pt-6">
        <span className="grid size-11 place-items-center rounded-full bg-ink">
          <Image src="/icon-512.png" alt="" width={30} height={30} priority />
        </span>
        <div className="flex flex-col">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-accent">
            YoTrade
          </p>
          <h1 className="text-lg font-bold leading-tight tracking-tight">
            Who&apos;s the best trader?
          </h1>
        </div>
      </header>

      <AccountCard />

      <section className="flex flex-col gap-3">
        <SectionLabel
          action={
            <Link
              href="/new"
              className="font-mono text-sm font-semibold text-accent hover:text-accent-strong"
            >
              Host one
            </Link>
          }
        >
          Tournaments
        </SectionLabel>
        <TournamentList />
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>How it works</SectionLabel>
        <ol className="flex flex-col gap-1">
          {STEPS.map((step) => (
            <li key={step.title}>
              <Card className="flex items-center gap-4">
                <Icon name={step.icon} />
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold leading-tight">{step.title}</h3>
                  <p className="text-sm font-medium text-ink-muted">{step.body}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
