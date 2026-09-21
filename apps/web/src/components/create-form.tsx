"use client";

import { tokens } from "@yotrade/core/addresses";
import { tournamentManagerAbi } from "@yotrade/plugin-tournament/abi";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { erc20Abi, parseEventLogs } from "viem";

import {
  buildConfig,
  DURATIONS,
  type CreateForm as Form,
  SPLITS,
  START_DELAYS,
} from "@/lib/create.ts";
import { fundGas, GasError } from "@/lib/fund-gas.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useRuntime } from "@/lib/use-runtime.ts";
import { PasskeyCard } from "./passkey-card.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Field } from "./ui/field.tsx";
import { Select } from "./ui/select.tsx";

const keys = <T extends object>(value: T) => Object.keys(value) as (keyof T & string)[];

const INITIAL: Form = {
  name: "",
  prizePool: "100",
  startDelay: "In 10 minutes",
  duration: "1 day",
  maxParticipants: "50",
  split: "Top 3",
};

export function CreateForm() {
  const router = useRouter();
  const { publicClient, kuru, tournament } = useRuntime();
  const { identity } = useIdentity();
  const [form, setForm] = useState(INITIAL);
  const [invalid, setInvalid] = useState<{ field: keyof Form; reason: string }>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);

  if (!identity) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Sign in to host</h2>
        <PasskeyCard />
      </section>
    );
  }
  const wallet = identity.wallet;
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const errorFor = (field: keyof Form) =>
    invalid?.field === field ? { error: invalid.reason } : {};

  async function create(config: Extract<ReturnType<typeof buildConfig>, { ok: true }>["config"]) {
    const address = wallet.account.address;
    await fundGas(publicClient, address);
    const balance = await publicClient.readContract({
      address: tokens.usdc.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance < config.prizePool) {
      if ((await kuru.faucet.nextClaimAt(address)) !== null) {
        throw new GasError(
          "This account already used the Kuru faucet today. Lower the prize pool or try later.",
        );
      }
      await kuru.faucet.claim(wallet);
    }
    const hash = await tournament.create(wallet, config);
    const receipt = await publicClient.getTransactionReceipt({ hash });
    const [created] = parseEventLogs({
      abi: tournamentManagerAbi,
      eventName: "TournamentCreated",
      logs: receipt.logs,
    });
    return created?.args.id;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(undefined);
    const built = buildConfig(form, BigInt(Math.floor(Date.now() / 1000)));
    if (!built.ok) {
      setInvalid(built);
      return;
    }
    setInvalid(undefined);
    setPending(true);
    try {
      const id = await create(built.config);
      router.push(id === undefined ? "/" : `/t/${id}`);
    } catch (cause) {
      console.error("create failed", cause);
      setFailure(
        cause instanceof GasError
          ? cause.message
          : "The tournament was not created. Nothing was escrowed.",
      );
      setPending(false);
    }
  }

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field
          label="Name"
          placeholder="Jogja Trading Cup"
          maxLength={60}
          value={form.name}
          onChange={(event) => set("name", event.target.value)}
          {...errorFor("name")}
        />
        <Field
          label="Prize pool in USDC"
          inputMode="decimal"
          value={form.prizePool}
          onChange={(event) => set("prizePool", event.target.value)}
          hint="Escrowed by the contract now, paid to the winners automatically. Test funds are claimed for you."
          {...errorFor("prizePool")}
        />
        <Select
          label="Prize split"
          options={keys(SPLITS)}
          value={form.split}
          onChange={(v) => set("split", v)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Starts"
            options={keys(START_DELAYS)}
            value={form.startDelay}
            onChange={(v) => set("startDelay", v)}
          />
          <Select
            label="Runs for"
            options={keys(DURATIONS)}
            value={form.duration}
            onChange={(v) => set("duration", v)}
          />
        </div>
        <Field
          label="Max traders"
          inputMode="numeric"
          value={form.maxParticipants}
          onChange={(event) => set("maxParticipants", event.target.value)}
          {...errorFor("maxParticipants")}
        />
        {failure ? (
          <p role="alert" className="text-sm text-down">
            {failure}
          </p>
        ) : null}
        <Button type="submit" pending={pending}>
          Create tournament
        </Button>
      </form>
    </Card>
  );
}
