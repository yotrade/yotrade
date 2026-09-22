"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Phase } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";
import { useState } from "react";

import { formatUsdc } from "@/lib/format.ts";
import { fundGas } from "@/lib/fund-gas.ts";
import { type HostAction, hostAction } from "@/lib/host.ts";
import type { IndexedTournamentDetail } from "@/lib/indexer.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";

const COPY: Record<HostAction, { title: string; body: string; button: string; confirm: string }> = {
  cancel: {
    title: "You host this tournament",
    body: "Until it starts you can call it off. Nobody can join after that.",
    button: "Cancel tournament",
    confirm: "Yes, cancel",
  },
  reclaim: {
    title: "No results were posted",
    body: "Seven days have passed since the end without a result, so the pool comes back to you.",
    button: "Reclaim the prize pool",
    confirm: "Yes, reclaim",
  },
  sweep: {
    title: "Something is left over",
    body: "Ranks nobody filled and rounding dust are yours. Winners keep what they can still claim.",
    button: "Sweep the remainder",
    confirm: "Yes, sweep",
  },
};

interface Props {
  readonly tournament: IndexedTournamentDetail;
  readonly phase: Phase;
  readonly now: bigint;
}

/** The organizer's card: edit while it runs, plus the one money move the contract would accept right now. */
export function HostPanel({ tournament, phase, now }: Props) {
  const { publicClient, tournament: manager } = useRuntime();
  const { identity } = useIdentity();
  const queryClient = useQueryClient();
  const [arming, setArming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const host = identity?.wallet.account.address === tournament.organizer;
  const state = useQuery({
    queryKey: ["tournament-state", tournament.id.toString()],
    queryFn: () => manager.get(tournament.id),
    enabled: host,
    refetchInterval: 10_000,
  });

  if (!(host && identity && state.data)) {
    return null;
  }
  const next = hostAction({
    phase,
    prizePool: tournament.prizePool,
    endTime: tournament.endTime,
    now,
    unpaid: state.data.unpaid,
    entries: tournament.entries,
  });
  // The contract takes new metadata while the tournament is open and not over: the same window as an invite.
  const editable = phase === "upcoming" || phase === "live";
  if (!(next || editable)) {
    return null;
  }
  const copy = next ? COPY[next.action] : null;

  async function run() {
    if (!(identity && next)) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await fundGas(publicClient, identity.wallet.account.address);
      await manager[next.action](identity.wallet, tournament.id);
      await queryClient.invalidateQueries({ queryKey: ["tournament"] });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["tournament-state"] });
      setArming(false);
    } catch (cause) {
      console.error(`${next.action} failed`, cause);
      setError("That did not go through. Nothing changed; try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 py-4">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Icon name="wallet" size={20} />
        {copy?.title ?? "You host this tournament"}
      </p>
      {editable ? (
        <Link
          href={`/t/${tournament.id}/edit`}
          className="flex min-h-10 items-center justify-center rounded-full bg-surface-raised px-4 text-sm font-semibold transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
        >
          Edit name and logo
        </Link>
      ) : null}
      {next && copy ? (
        <>
          <p className="text-sm font-medium leading-5 text-ink-muted">
            {copy.body}
            {next.amount > 0n ? (
              <>
                {" "}
                Back to you:{" "}
                <span className="tabular font-semibold text-ink">${formatUsdc(next.amount)}</span>.
              </>
            ) : null}
          </p>
          {arming ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="min-h-10"
                onClick={() => setArming(false)}
                disabled={pending}
              >
                Keep it
              </Button>
              <Button className="min-h-10 bg-down hover:bg-down" pending={pending} onClick={run}>
                {copy.confirm}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="min-h-10" onClick={() => setArming(true)}>
              {copy.button}
            </Button>
          )}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
