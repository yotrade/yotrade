"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Phase } from "@yotrade/plugin-tournament/phase";
import { useState } from "react";

import { ActionError, describeFailure, isSettled } from "@/lib/describe-failure.ts";
import { formatUsdc, timeUntil } from "@/lib/format.ts";
import { fundGas } from "@/lib/fund-gas.ts";
import type { IndexedTournamentDetail } from "@/lib/indexer.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { traderName, useProfiles } from "@/lib/use-profiles.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Podium } from "./podium.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";

interface Props {
  readonly tournament: IndexedTournamentDetail;
  readonly phase: Phase;
  readonly now: bigint;
}

/** Everything that happens after the last trade: finalize, review window, standings, claim. */
export function ResultsPanel({ tournament, phase, now }: Props) {
  const { publicClient, tournament: manager } = useRuntime();
  const { identity } = useIdentity();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const profileOf = useProfiles(tournament.entries.map((entry) => entry.participant_id));

  if (phase !== "scoring" && phase !== "dispute" && phase !== "claimable") {
    return null;
  }

  // The indexer trails the chain by seconds. Once an action went through, its button stays gone until then.
  async function run(action: () => Promise<void>, failure: string) {
    setPending(true);
    setError(undefined);
    try {
      await action();
      setDone(true);
      await queryClient.invalidateQueries({ queryKey: ["tournament"] });
    } catch (cause) {
      console.error(failure, cause);
      if (isSettled(cause)) {
        setDone(true);
      } else {
        setError(describeFailure(cause, failure));
      }
    } finally {
      setPending(false);
    }
  }

  if (phase === "scoring") {
    const finalize = async () => {
      const response = await fetch(`/api/tournaments/${tournament.id}/finalize`, {
        method: "POST",
      });
      // 409 means someone else finalized first, which is the outcome we wanted.
      if (!response.ok && response.status !== 409) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new ActionError(body?.error ?? `Finalize answered ${response.status}`);
      }
    };
    return (
      <Card className="flex flex-col gap-3">
        <p className="font-semibold">Time's up</p>
        <p className="text-sm text-ink-muted">
          Anyone can finalize. Winners are computed from public trading data, not chosen by whoever
          taps.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-down">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="text-sm font-medium text-ink-muted">Results posted. Updating…</p>
        ) : (
          <Button
            pending={pending}
            onClick={() => run(finalize, "Results could not be posted. Try again shortly.")}
          >
            Finalize results
          </Button>
        )}
      </Card>
    );
  }

  const wallet = identity?.tournamentWallet(tournament.id);
  const standings = tournament.entries
    .filter((entry) => entry.rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const mine = standings.find((entry) => entry.participant_id === wallet?.account.address);
  const claimable = phase === "claimable" && mine !== undefined && !mine.claimed && mine.prize > 0n;
  const claim = async () => {
    if (wallet) {
      await fundGas(publicClient, wallet.account.address);
      await manager.claim(wallet, tournament.id);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <p className="font-semibold">
        {phase === "dispute"
          ? `Results in review · prizes unlock in ${timeUntil(tournament.claimableAt, now)}`
          : "Final results"}
      </p>
      {standings.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nobody traded, so the prize pool returns to the organizer.
        </p>
      ) : (
        <>
          <Podium
            entries={standings.slice(0, 3).map((entry) => ({
              address: entry.participant_id,
              name: traderName(
                entry.participant_id,
                profileOf(entry.participant_id),
                entry === mine,
              ),
              avatar: profileOf(entry.participant_id)?.avatar,
              score:
                entry.prize > 0n
                  ? `$${formatUsdc(entry.prize)}${entry.claimed ? " ✓" : ""}`
                  : "No prize",
              you: entry === mine,
            }))}
          />
          <ol className="flex flex-col gap-1.5">
            {standings.map((entry) => (
              <li
                key={entry.participant_id}
                className={`tabular flex items-center justify-between text-sm ${entry.rank && entry.rank <= 3 ? "sr-only" : ""}`}
              >
                <span>
                  #{entry.rank}{" "}
                  {traderName(
                    entry.participant_id,
                    profileOf(entry.participant_id),
                    entry === mine,
                  )}
                </span>
                <span className={entry.claimed ? "text-ink-muted" : "font-semibold text-up"}>
                  {formatUsdc(entry.prize)} USDC{entry.claimed ? " · claimed" : ""}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
      {claimable && done ? (
        <p className="text-sm font-medium text-ink-muted">Claimed. Updating…</p>
      ) : null}
      {claimable && !done ? (
        <Button
          pending={pending}
          onClick={() => run(claim, "The prize was not claimed. Try again.")}
        >
          Claim {formatUsdc(mine.prize)} USDC
        </Button>
      ) : null}
    </Card>
  );
}
