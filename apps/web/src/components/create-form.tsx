"use client";

import { tokens } from "@yotrade/core/addresses";
import type { MeraWallet } from "@yotrade/plugin-mera/plugin";
import { tournamentManagerAbi } from "@yotrade/plugin-tournament/abi";
import type { Route } from "next";
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
import { saveInvite } from "@/lib/invite.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useRuntime } from "@/lib/use-runtime.ts";
import { LogoPicker } from "./logo-picker.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";
import { Icon } from "./ui/icon.tsx";
import { Segmented } from "./ui/segmented.tsx";
import { Select } from "./ui/select.tsx";

const VENUES = ["Spot", "Futures"] as const;
const VISIBILITIES = ["Public", "Private"] as const;

const keys = <T extends object>(value: T) => Object.keys(value) as (keyof T & string)[];

const INITIAL: Form = {
  venue: "spot",
  visibility: "public",
  name: "",
  image: "",
  prizePool: "100",
  startDelay: "In 10 minutes",
  duration: "1 day",
  maxParticipants: "50",
  split: "Top 3",
};

const STEPS = [
  { title: "Host a tournament", body: "Give it a name and decide who plays." },
  { title: "The prize", body: "What the winners take home." },
  { title: "Schedule", body: "When it runs, and for how many traders." },
] as const;

function Progress({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      {STEPS.map((item, index) => (
        <span
          key={item.title}
          className={`h-1 flex-1 rounded-full transition-colors duration-300 ${index <= step ? "bg-accent" : "bg-border"}`}
        />
      ))}
    </div>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange(next: T): void;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold tracking-tight">{label}</p>
      <Segmented<T> label={label} options={options} value={value} onChange={onChange} />
      <p className="text-[13px] font-medium leading-5 text-ink-muted">{hint}</p>
    </div>
  );
}

/** What the contract is about to be asked for, in the host's words. */
function Review({ form }: { form: Form }) {
  const rows: [string, string][] = [
    ["Name", form.name.trim() || "—"],
    ["Logo", form.image.trim() ? "Custom" : "Default"],
    ["Market", form.venue === "futures" ? "Futures · Pyth" : "Spot · Kuru"],
    ["Who can join", form.visibility === "private" ? "Invite link only" : "Anyone"],
    ["Prize", `${form.prizePool || "0"} USDC · ${form.split}`],
    ["Runs", `${form.startDelay.toLowerCase()} for ${form.duration}`],
    ["Traders", `Up to ${form.maxParticipants || "—"}`],
  ];
  return (
    <dl className="flex flex-col gap-2 rounded-2xl bg-surface-raised p-4">
      {rows.map(([name, value]) => (
        <div key={name} className="flex items-center justify-between gap-3 text-sm">
          <dt className="font-medium text-ink-muted">{name}</dt>
          <dd className="truncate text-right font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface StepProps {
  readonly step: number;
  readonly form: Form;
  set<K extends keyof Form>(key: K, value: Form[K]): void;
  errorFor(field: keyof Form): { error?: string };
  onLogoStatus(ok: boolean | undefined): void;
  readonly wallet: MeraWallet;
}

function StepFields({ step, form, set, errorFor, onLogoStatus, wallet }: StepProps) {
  return (
    <>
      {step === 0 ? (
        <>
          <Field
            label="Name"
            placeholder="Jogja Trading Cup"
            maxLength={60}
            autoFocus
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            {...errorFor("name")}
          />
          <LogoPicker
            wallet={wallet}
            value={form.image}
            error={errorFor("image").error}
            onChange={(next) => set("image", next)}
            onStatus={onLogoStatus}
          />
          <Choice
            label="Market"
            options={VENUES}
            value={form.venue === "futures" ? "Futures" : "Spot"}
            onChange={(v) => set("venue", v === "Futures" ? "futures" : "spot")}
            hint={
              form.venue === "futures"
                ? "Long or short BTC, ETH and SOL with up to 20x, at Pyth prices. Everyone starts with a virtual $10,000."
                : "Buy and sell real tokens on Kuru's order books with test funds."
            }
          />
          <Choice
            label="Who can join"
            options={VISIBILITIES}
            value={form.visibility === "private" ? "Private" : "Public"}
            onChange={(v) => set("visibility", v === "Private" ? "private" : "public")}
            hint={
              form.visibility === "private"
                ? "Hidden from the arena. Only people with your invite link can join, and you can revoke it."
                : "Listed in the arena. Anyone can join until it is full."
            }
          />
        </>
      ) : null}
      {step === 1 ? (
        <>
          <Field
            label="Prize pool in USDC"
            inputMode="decimal"
            autoFocus
            value={form.prizePool}
            onChange={(event) => set("prizePool", event.target.value)}
            hint="Escrowed now, paid to the winners automatically. Test funds are claimed for you. 0 is fine for a friendly."
            {...errorFor("prizePool")}
          />
          <Select
            label="Prize split"
            options={keys(SPLITS)}
            value={form.split}
            onChange={(v) => set("split", v)}
          />
        </>
      ) : null}
      {step === 2 ? (
        <>
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
          <Review form={form} />
        </>
      ) : null}
    </>
  );
}

export function CreateForm() {
  const router = useRouter();
  const { publicClient, kuru, tournament } = useRuntime();
  const { identity } = useIdentity();
  const [form, setForm] = useState(INITIAL);
  const [invalid, setInvalid] = useState<{ field: keyof Form; reason: string }>();
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);
  const [logoOk, setLogoOk] = useState<boolean>();

  if (!identity) {
    // The onboarding gate guarantees an identity before any page renders.
    return null;
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
    const id = created?.args.id;
    if (id === undefined || form.visibility !== "private" || !identity) {
      return id === undefined ? "/" : `/t/${id}`;
    }
    // The invite key comes from the host's passkey: nothing to store, and any device can share or rotate it.
    const invite = identity.inviteKey(id, 0);
    await tournament.setInvite(wallet, id, invite.address);
    saveInvite(id, invite.privateKey);
    return `/t/${id}#invite=${invite.privateKey}`;
  }

  /** Fields that live on each step, so a rejected field sends the host back to where it is. */
  const stepOf: Record<keyof Form, number> = {
    name: 0,
    image: 0,
    venue: 0,
    visibility: 0,
    prizePool: 1,
    split: 1,
    startDelay: 2,
    duration: 2,
    maxParticipants: 2,
  };

  function next() {
    const built = buildConfig(form, BigInt(Math.floor(Date.now() / 1000)));
    if (!built.ok && stepOf[built.field] <= step) {
      setInvalid(built);
      setStep(stepOf[built.field]);
      return;
    }
    // The link is written to the chain for good, so a logo that does not load stops here.
    if (step === 0 && form.image.trim() !== "" && logoOk !== true) {
      setInvalid({
        field: "image",
        reason: "That image did not load. Check the link or clear it.",
      });
      return;
    }
    setInvalid(undefined);
    setStep(step + 1);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      next();
      return;
    }
    setFailure(undefined);
    const built = buildConfig(form, BigInt(Math.floor(Date.now() / 1000)));
    if (!built.ok) {
      setInvalid(built);
      setStep(stepOf[built.field]);
      return;
    }
    setInvalid(undefined);
    setPending(true);
    try {
      // Typed routes cannot express a fragment; the string is one of our own paths.
      router.push((await create(built.config)) as Route);
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

  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;

  return (
    <form className="flex flex-1 flex-col gap-6 pb-28" onSubmit={submit}>
      <header className="flex items-center gap-3">
        {step === 0 ? (
          <BackButton />
        ) : (
          <button
            type="button"
            aria-label="Previous step"
            onClick={() => setStep(step - 1)}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-well transition duration-200 hover:bg-border focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
          >
            <Icon name="chevron-left" size={20} />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-xl font-bold leading-[26px] tracking-tight">
            {current.title}
          </h1>
          <p className="text-sm font-medium text-ink-muted">{current.body}</p>
        </div>
      </header>
      <Progress step={step} />

      <div key={step} className="flex animate-enter flex-col gap-4">
        <StepFields
          step={step}
          form={form}
          set={set}
          errorFor={errorFor}
          onLogoStatus={setLogoOk}
          wallet={wallet}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md flex-col gap-2 bg-surface/90 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 backdrop-blur">
        {failure ? (
          <p role="alert" className="text-sm font-medium text-down">
            {failure}
          </p>
        ) : null}
        <Button type="submit" pending={pending}>
          {last ? "Create tournament" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
