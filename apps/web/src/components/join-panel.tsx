"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tokens } from "@yotrade/core/addresses";
import type { MeraWallet } from "@yotrade/plugin-mera/plugin";
import type { Phase } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";
import { useState } from "react";
import { erc20Abi } from "viem";

import { formatUsdc, shortAddress } from "@/lib/format.ts";
import { fundGas, GasError } from "@/lib/fund-gas.ts";
import type { IndexedTournament } from "@/lib/indexer.ts";
import { JOIN_STEPS, type JoinDeps, JoinError, type JoinStep, runJoin } from "@/lib/join.ts";
import type { AppRuntime } from "@/lib/runtime.ts";
import { formatBps, roiBps } from "@/lib/ticket.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";

const STEP_LABELS: Record<JoinStep, string> = {
  gas: "Getting gas",
  faucet: "Claiming test funds from Kuru",
  deposit: "Depositing into Kuru",
  join: "Registering onchain",
};

function joinDeps(runtime: AppRuntime, wallet: MeraWallet, id: bigint): JoinDeps {
  const { publicClient, kuru, tournament } = runtime;
  const address = wallet.account.address;

  return {
    hasJoined: async () => (await tournament.entry(id, address)) !== null,
    fundGas: () => fundGas(publicClient, address),
    walletUsdc: () =>
      publicClient.readContract({
        address: tokens.usdc.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }),
    kuruUsdc: async () => (await kuru.portfolio(address)).holdings["usdc"]?.free ?? 0n,
    canClaimFaucet: async () => (await kuru.faucet.nextClaimAt(address)) === null,
    claimFaucet: () => kuru.faucet.claim(wallet),
    deposit: (amount) => kuru.account.deposit(wallet, tokens.usdc.address, amount),
    join: () => tournament.join(wallet, id, address),
  };
}

/** Joined: what my account is worth, and the one thing to do next. */
function MyStatus({
  id,
  wallet,
  capitalAtJoin,
  phase,
}: {
  id: bigint;
  wallet: MeraWallet;
  capitalAtJoin: bigint;
  phase: Phase;
}) {
  const { kuru } = useRuntime();
  const address = wallet.account.address;
  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => kuru.portfolio(address),
    refetchInterval: 3_000,
    enabled: phase === "upcoming" || phase === "live",
  });
  const value = portfolio.data?.totalUsdc ?? capitalAtJoin;
  const roi = roiBps(value, capitalAtJoin);

  return (
    <Card className="flex flex-col gap-4 py-4">
      <div className="flex items-center gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft">
          <Icon name="check" size={20} />
          <Icon name="sparkle" size={16} className="absolute -right-1.5 -top-1.5 animate-float" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-semibold leading-[21px]">You&apos;re in</p>
          <p className="truncate font-mono text-[13px] text-ink-muted">{shortAddress(address)}</p>
        </div>
        <div className="flex flex-col items-end">
          <p className="tabular font-semibold leading-[21px]">${formatUsdc(value)}</p>
          {roi === null ? null : (
            <p className={`tabular text-sm font-medium ${roi >= 0 ? "text-up" : "text-down"}`}>
              {formatBps(roi)}
            </p>
          )}
        </div>
      </div>
      {phase === "live" ? (
        <Link
          href={`/t/${id}/trade`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-accent bg-accent px-5 font-mono text-[15px] font-semibold tracking-tight text-accent-ink shadow-button transition duration-200 hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
        >
          <Icon name="swap" size={18} className="brightness-0 invert" />
          Trade
        </Link>
      ) : null}
      {phase === "upcoming" ? (
        <p className="text-sm font-medium text-ink-muted">
          Trading opens when the tournament starts.
        </p>
      ) : null}
    </Card>
  );
}

export function JoinPanel({ tournament, phase }: { tournament: IndexedTournament; phase: Phase }) {
  const runtime = useRuntime();
  const { identity } = useIdentity();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<JoinStep | null>(null);
  const [error, setError] = useState<string>();

  const wallet = identity?.tournamentWallet(tournament.id);
  const address = wallet?.account.address;
  const entry = useQuery({
    queryKey: ["entry", tournament.id.toString(), address],
    queryFn: () => (address ? runtime.tournament.entry(tournament.id, address) : null),
    enabled: address !== undefined,
  });

  if (!(wallet && address)) {
    // The onboarding gate guarantees an identity before any page renders.
    return null;
  }
  if (entry.data) {
    return (
      <MyStatus
        id={tournament.id}
        wallet={wallet}
        capitalAtJoin={entry.data.capitalAtJoin}
        phase={phase}
      />
    );
  }
  if (phase !== "upcoming" && phase !== "live") {
    return null;
  }
  if (tournament.allowlisted) {
    return <p className="text-sm text-ink-muted">This tournament is invite only.</p>;
  }
  if (tournament.participantCount >= tournament.maxParticipants) {
    return <p className="text-sm text-ink-muted">This tournament is full.</p>;
  }

  async function join() {
    if (!wallet) {
      return;
    }
    setError(undefined);
    try {
      await runJoin(joinDeps(runtime, wallet, tournament.id), tournament.startingCapital, setStep);
      await queryClient.invalidateQueries({ queryKey: ["entry"] });
      await queryClient.invalidateQueries({ queryKey: ["tournament"] });
    } catch (cause) {
      setError(
        cause instanceof JoinError || cause instanceof GasError
          ? cause.message
          : "Joining stopped before it finished. Tap again to continue where it left off.",
      );
    } finally {
      setStep(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3 py-4">
      <p className="text-sm font-medium text-ink-muted">
        You get a fresh trading account for this tournament, funded with Kuru test funds. No wallet
        needed.
      </p>
      {step ? (
        <ol className="flex flex-col gap-1 text-sm" aria-live="polite">
          {JOIN_STEPS.map((name) => (
            <li key={name} className={name === step ? "font-semibold text-ink" : "text-ink-muted"}>
              {name === step ? "→ " : ""}
              {STEP_LABELS[name]}
            </li>
          ))}
        </ol>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
      <Button pending={step !== null} onClick={join}>
        Join tournament
      </Button>
    </Card>
  );
}
