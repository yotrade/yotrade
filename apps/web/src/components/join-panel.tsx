"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tokens } from "@yotrade/core/addresses";
import type { MeraWallet } from "@yotrade/plugin-mera/plugin";
import type { Phase } from "@yotrade/plugin-tournament/phase";
import { useState } from "react";
import { erc20Abi, parseEther } from "viem";

import { formatUsdc, shortAddress } from "@/lib/format.ts";
import type { IndexedTournament } from "@/lib/indexer.ts";
import { JOIN_STEPS, type JoinDeps, JoinError, type JoinStep, runJoin } from "@/lib/join.ts";
import type { AppRuntime } from "@/lib/runtime.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useRuntime } from "@/lib/use-runtime.ts";
import { PasskeyCard } from "./passkey-card.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";

/** Enough for the join transactions. The drip route tops accounts up well above this. */
const MIN_GAS = parseEther("0.1");

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
    async fundGas() {
      if ((await publicClient.getBalance({ address })) >= MIN_GAS) {
        return;
      }
      const response = await fetch("/api/drip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if ((await publicClient.getBalance({ address })) < MIN_GAS) {
        throw new JoinError(
          response.status === 429
            ? "The gas faucet is rate limited. Try again in a few minutes."
            : "The gas faucet is unavailable right now. Try again shortly.",
        );
      }
    },
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
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Sign in to join</h2>
        <PasskeyCard />
      </section>
    );
  }
  if (entry.data) {
    return (
      <Card className="flex flex-col gap-1">
        <p className="font-semibold text-up">You're in</p>
        <p className="text-sm text-ink-muted">
          Trading account <span className="font-mono">{shortAddress(address)}</span> ·{" "}
          <span className="tabular">{formatUsdc(entry.data.capitalAtJoin)} USDC at join</span>
        </p>
      </Card>
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
        cause instanceof JoinError
          ? cause.message
          : "Joining stopped before it finished. Tap again to continue where it left off.",
      );
    } finally {
      setStep(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
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
