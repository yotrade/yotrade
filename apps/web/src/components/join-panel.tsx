"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tokens } from "@yotrade/core/addresses";
import type { MeraWallet } from "@yotrade/plugin-mera/plugin";
import type { Phase } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";
import { useState } from "react";
import { erc20Abi, type Hex } from "viem";

import { describeFailure } from "@/lib/describe-failure.ts";
import { formatUsdc } from "@/lib/format.ts";
import { fundGas } from "@/lib/fund-gas.ts";
import type { IndexedTournament } from "@/lib/indexer.ts";
import { loadInvite, parseInviteCode, saveInvite } from "@/lib/invite.ts";
import { JOIN_STEPS, type JoinDeps, type JoinStep, runJoin } from "@/lib/join.ts";
import { toUsdc } from "@/lib/perps-markets.ts";
import { isEmpty, loadProfile, parseProfile, publishProfile } from "@/lib/profile.ts";
import type { AppRuntime } from "@/lib/runtime.ts";
import { formatBps, roiBps } from "@/lib/ticket.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useLocalProfile } from "@/lib/use-local-profile.ts";
import { usePerps } from "@/lib/use-perps.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { type Venue, venueOf } from "@/lib/venue.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Field } from "./ui/field.tsx";
import { Icon } from "./ui/icon.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const STEP_LABELS: Record<JoinStep, string> = {
  gas: "Getting gas",
  faucet: "Claiming test funds from Kuru",
  deposit: "Depositing into Kuru",
  join: "Registering onchain",
};

function joinDeps(runtime: AppRuntime, wallet: MeraWallet, id: bigint, code: Hex | null): JoinDeps {
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
    join: async () =>
      tournament.join(
        wallet,
        id,
        address,
        code ? await tournament.inviteProof(code, id, address) : [],
      ),
  };
}

function describeJoinError(cause: unknown): string {
  return describeFailure(
    cause,
    "Joining stopped before it finished. Tap again to continue where it left off.",
  );
}

/** Joined: what my account is worth, and the one thing to do next. */
function MyStatus({
  id,
  wallet,
  capitalAtJoin,
  phase,
  venue,
}: {
  id: bigint;
  wallet: MeraWallet;
  capitalAtJoin: bigint;
  phase: Phase;
  venue: Venue;
}) {
  const { kuru } = useRuntime();
  const address = wallet.account.address;
  const open = phase === "upcoming" || phase === "live";
  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => kuru.portfolio(address),
    refetchInterval: 3_000,
    enabled: open && venue === "spot",
  });
  // A futures account is worth its equity at live Pyth prices, in the same six-decimal dollars.
  const futures = usePerps(id.toString(), venue === "futures" ? address : undefined);
  const equity = futures.data
    ? toUsdc(futures.data.risk.equity < 0n ? 0n : futures.data.risk.equity)
    : undefined;
  const value = (venue === "futures" ? equity : portfolio.data?.totalUsdc) ?? capitalAtJoin;
  const roi = roiBps(value, capitalAtJoin);

  if (phase !== "upcoming" && phase !== "live") {
    // After the end the results card and the table say everything.
    return null;
  }
  return (
    <div className="fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] z-10 mx-auto w-full max-w-md px-5">
      <div className="flex items-center gap-3 rounded-full bg-ink p-2 pl-4 text-white shadow-[0_8px_24px_#0e091c40]">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-[11px] font-semibold leading-4 text-white/70">
            You&apos;re in{phase === "upcoming" ? " · opens at the start" : ""}
          </p>
          <p className="tabular flex items-baseline gap-2 font-semibold leading-5">
            ${formatUsdc(value)}
            {roi === null ? null : (
              <span className={`text-sm ${roi >= 0 ? "text-[#7ce7a3]" : "text-[#ff8a8a]"}`}>
                {formatBps(roi)}
              </span>
            )}
          </p>
        </div>
        {phase === "live" ? (
          <Link
            href={`/t/${id}/trade`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 font-mono text-[15px] font-semibold tracking-tight text-accent-ink transition duration-200 hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
          >
            <Icon name="swap" size={18} className="brightness-0 invert" />
            Trade
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function JoinPanel({ tournament, phase }: { tournament: IndexedTournament; phase: Phase }) {
  const runtime = useRuntime();
  const { identity } = useIdentity();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<JoinStep | null>(null);
  const [error, setError] = useState<string>();
  const [localProfile, setLocalProfile] = useLocalProfile();
  const named = localProfile.name !== "";
  const [nickname, setNickname] = useState("");

  const wallet = identity?.tournamentWallet(tournament.id);
  const venue = venueOf(tournament.venue);
  const address = wallet?.account.address;
  const inviteSigner = useQuery({
    queryKey: ["invite-signer", tournament.id.toString()],
    queryFn: () => runtime.tournament.inviteSignerOf(tournament.id),
  });
  const [code, setCode] = useState(() => loadInvite(tournament.id));
  const entry = useQuery({
    queryKey: ["entry", tournament.id.toString(), address],
    queryFn: () => (address ? runtime.tournament.entry(tournament.id, address) : null),
    enabled: address !== undefined,
  });

  if (!(wallet && address)) {
    // The onboarding gate guarantees an identity before any page renders.
    return null;
  }
  // Nothing to offer until we know: the join card must not flash for someone who is already in.
  if (entry.isPending) {
    return (
      <Loading label="Loading your entry">
        <Skeleton className="h-[72px] rounded-2xl" />
      </Loading>
    );
  }
  if (entry.data) {
    return (
      <MyStatus
        id={tournament.id}
        wallet={wallet}
        capitalAtJoin={entry.data.capitalAtJoin}
        phase={phase}
        venue={venue}
      />
    );
  }
  if (phase !== "upcoming" && phase !== "live") {
    return null;
  }
  if (tournament.allowlisted) {
    return <p className="text-sm text-ink-muted">This tournament is invite only.</p>;
  }
  if (inviteSigner.data && inviteSigner.data !== ZERO_ADDRESS && !code) {
    return (
      <InviteGate
        onCode={(next) => {
          saveInvite(tournament.id, next);
          setCode(next);
        }}
      />
    );
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
      await runJoin(
        joinDeps(runtime, wallet, tournament.id, code),
        tournament.startingCapital,
        setStep,
        venue,
      );
      let profile = loadProfile();
      const picked = parseProfile(nickname, profile.avatar);
      if (!(named || "error" in picked) && picked.name !== "") {
        profile = picked;
        setLocalProfile(profile);
      }
      if (!isEmpty(profile)) {
        // Cosmetic: a trader who joined must never see "joining failed" because a name did not save.
        await publishProfile(runtime.publicClient, wallet, profile).catch(() => undefined);
      }
      await queryClient.invalidateQueries({ queryKey: ["entry"] });
      await queryClient.invalidateQueries({ queryKey: ["tournament"] });
    } catch (cause) {
      setError(describeJoinError(cause));
    } finally {
      setStep(null);
    }
  }

  return (
    <Card className="flex flex-col gap-3 py-4">
      <p className="text-sm font-medium text-ink-muted">
        {venue === "futures"
          ? "You get a fresh account with a virtual $10,000 to go long or short. No wallet needed."
          : "You get a fresh trading account for this tournament, funded with Kuru test funds. No wallet needed."}
      </p>
      {step ? (
        <ol className="flex flex-col gap-1 text-sm" aria-live="polite">
          {JOIN_STEPS.filter((name) => venue === "spot" || name === "gas" || name === "join").map(
            (name) => (
              <li
                key={name}
                className={name === step ? "font-semibold text-ink" : "text-ink-muted"}
              >
                {name === step ? "→ " : ""}
                {STEP_LABELS[name]}
              </li>
            ),
          )}
        </ol>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
      {named ? null : (
        <Field
          label="Your name on the board"
          placeholder="Ayu"
          maxLength={24}
          autoComplete="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          hint="Optional. You can change it later in Account."
        />
      )}
      <Button pending={step !== null} onClick={join}>
        Join tournament
      </Button>
    </Card>
  );
}

/** The private card: the link still works on its own, and a code or link can be pasted here instead. */
function InviteGate({ onCode }: { onCode(code: Hex): void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  return (
    <Card className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">This tournament is private</p>
        <p className="text-sm font-medium leading-5 text-ink-muted">
          Ask the host for the invite. Opening their link is all it takes, or paste the code here.
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const code = parseInviteCode(value);
          if (code) {
            onCode(code);
          } else {
            setError("That is not an invite code. It starts with 0x and is 66 characters long.");
          }
        }}
      >
        <Field
          label="Invite code"
          placeholder="0x… or the whole invite link"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(undefined);
          }}
          {...(error ? { error } : {})}
        />
        <Button
          type="submit"
          variant="secondary"
          className="min-h-10"
          disabled={value.trim() === ""}
        >
          Use code
        </Button>
      </form>
    </Card>
  );
}
