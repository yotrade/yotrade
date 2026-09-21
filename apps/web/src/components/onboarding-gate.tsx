"use client";

import Image from "next/image";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { Address } from "viem";

import { describeAuthError } from "@/lib/auth-error.ts";
import { shortAddress } from "@/lib/format.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Field } from "./ui/field.tsx";
import { Icon, type IconName } from "./ui/icon.tsx";

const SPLASH_MS = 1_200;
const SEEN_KEY = "yotrade.onboarded";

const SLIDES = [
  {
    title: "Your community's trading arena",
    body: "Host or join live trading tournaments on Monad, straight from a link.",
  },
  {
    title: "Same capital, real markets",
    body: "Everyone starts equal and trades Kuru's onchain order books.",
  },
  {
    title: "Scores you can verify",
    body: "Rankings come from public fills. The prize sits in a contract and pays the winners.",
  },
] as const;

const NEXT_STEPS: readonly { icon: IconName; title: string; body: string }[] = [
  { icon: "crown", title: "Join a tournament", body: "Pick one and trade for the prize pool" },
  { icon: "plus", title: "Host your own", body: "Set a prize and share the link" },
];

type Step = "splash" | "slides" | "returning" | "create" | "ready";

/** The kit's welcome badge: a glowing disc with two sparkles. */
function Badge() {
  return (
    <div className="relative animate-pop">
      <span aria-hidden className="absolute inset-3 animate-glow rounded-full bg-accent blur-2xl" />
      <Image
        src="/logo.png"
        alt="YoTrade"
        width={118}
        height={118}
        priority
        className="relative rounded-full"
      />
      <Icon name="sparkle" size={32} className="absolute -right-5 -top-1 animate-float" />
      <Icon
        name="sparkle-small"
        size={21}
        className="absolute -left-4 -top-2 animate-float [animation-delay:-2s]"
      />
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="text-center text-[11px] leading-4 text-ink-muted">
      Monad testnet only. Funds here have no real value.
    </p>
  );
}

function hasOnboarded(): boolean {
  // A convenience flag, nothing sensitive. Storage can be unavailable in private windows.
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function ReadyScreen({ address, onContinue }: { address: Address; onContinue(): void }) {
  return (
    <main className="flex flex-1 animate-enter flex-col gap-8 pb-6 pt-16">
      <div className="relative mx-auto max-w-[220px]">
        <h1 className="text-center text-2xl font-bold leading-8 tracking-tight">
          Sweet! Your new account is ready!
        </h1>
        <Icon name="sparkle" size={32} className="absolute -right-10 -top-6 animate-float" />
        <Icon name="sparkle-small" size={21} className="absolute -left-10 -top-3" />
      </div>
      <div className="flex flex-col items-center gap-3 rounded-[40px] bg-surface-raised p-6">
        <Avatar address={address} size={96} />
        <p className="font-mono text-sm font-semibold">{shortAddress(address)}</p>
        <p className="text-center text-[13px] leading-5 text-ink-muted">
          Derived from your passkey. No seed phrase, nothing stored on this device.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-center text-lg font-semibold">Let&apos;s get started</h2>
        <ul className="flex flex-col gap-1">
          {NEXT_STEPS.map((item) => (
            <li key={item.title}>
              <Card className="flex items-center gap-4">
                <Icon name={item.icon} />
                <div className="flex flex-col gap-1">
                  <p className="font-semibold leading-tight">{item.title}</p>
                  <p className="text-sm font-medium text-ink-muted">{item.body}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
      <Button className="mt-auto" onClick={onContinue}>
        Continue
      </Button>
    </main>
  );
}

interface CreateProps {
  readonly pending: boolean;
  readonly error: string | undefined;
  onBack(): void;
  onCreate(name: string): void;
}

function CreateScreen({ pending, error, onBack, onCreate }: CreateProps) {
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate(name.trim());
  };
  return (
    <main className="flex flex-1 animate-enter flex-col gap-6 pb-6 pt-4">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="grid size-10 place-items-center rounded-full bg-well hover:bg-border focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon name="chevron-left" size={20} />
      </button>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold leading-8 tracking-tight">What should we call you?</h1>
        <p className="font-medium text-ink-muted">
          Your name is saved with the passkey. Face ID or your fingerprint is all you need next
          time.
        </p>
      </div>
      <form className="flex flex-1 flex-col gap-4" onSubmit={submit}>
        <Field
          label="Display name"
          placeholder="satoshi"
          autoComplete="nickname"
          maxLength={32}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          {...(error ? { error } : {})}
        />
        <Button type="submit" className="mt-auto" pending={pending}>
          <Icon name="face-scan" size={20} className="brightness-0 invert" />
          Create passkey
        </Button>
      </form>
    </main>
  );
}

interface IntroProps {
  readonly returning: boolean;
  readonly pending: boolean;
  readonly error: string | undefined;
  onCreate(): void;
  onSignIn(): void;
}

/** Kit onboarding layout: illustration on top; title, description, step dots and two buttons below. */
function IntroScreen({ returning, pending, error, onCreate, onSignIn }: IntroProps) {
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide] ?? SLIDES[0];
  const last = slide === SLIDES.length - 1;
  const title = returning ? "Welcome back" : current.title;
  const body = returning ? "Your account comes back with your passkey." : current.body;
  const primary = returning
    ? { label: "Sign in with passkey", action: onSignIn }
    : {
        label: last ? "Create account" : "Continue",
        action: last ? onCreate : () => setSlide(slide + 1),
      };
  const secondary = returning
    ? { label: "Create a new account", action: onCreate }
    : { label: "I already have a passkey", action: onSignIn };

  return (
    <main className="flex flex-1 animate-enter flex-col pb-6">
      <div className="grid flex-1 place-items-center py-8">
        {returning ? (
          <Badge />
        ) : (
          <Image
            src="/illustrations/onboarding.svg"
            alt=""
            aria-hidden
            width={294}
            height={278}
            unoptimized
            priority
          />
        )}
      </div>
      <div className="flex flex-col items-center gap-6 px-2">
        <div key={title} className="flex animate-enter flex-col gap-3 text-center">
          <h1 className="text-[34px] font-bold leading-[1.2] tracking-tight">{title}</h1>
          <p className="font-semibold leading-snug text-ink-muted">{body}</p>
        </div>
        {returning ? null : (
          <div
            className="flex gap-1.5"
            role="img"
            aria-label={`Step ${slide + 1} of ${SLIDES.length}`}
          >
            {SLIDES.map((item, index) => (
              <span
                key={item.title}
                className={`h-1 rounded-full transition-all ${index === slide ? "w-3 bg-ink" : "w-1 bg-border"}`}
              />
            ))}
          </div>
        )}
        {error ? (
          <p role="alert" className="text-center text-[13px] leading-5 text-down">
            {error}
          </p>
        ) : null}
        <div className="flex w-full flex-col gap-4">
          <Button pending={returning && pending} disabled={pending} onClick={primary.action}>
            {primary.label}
          </Button>
          <Button
            variant="secondary"
            className="bg-surface shadow-button ring-1 ring-border"
            pending={!returning && pending}
            disabled={pending}
            onClick={secondary.action}
          >
            {secondary.label}
          </Button>
        </div>
        <Disclaimer />
      </div>
    </main>
  );
}

/**
 * Nothing in the app works without an account, so visitors meet the kit's onboarding first:
 * welcome, three slides, passkey, ready. The identity lives in memory, so a reload lands on "welcome back".
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { identity, register, signIn } = useIdentity();
  const [step, setStep] = useState<Step>("splash");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const timer = setTimeout(() => {
      const next: Step = hasOnboarded() ? "returning" : "slides";
      setStep((current) => (current === "splash" ? next : current));
    }, SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  async function run(action: () => Promise<void>, next: Step) {
    setPending(true);
    setError(undefined);
    try {
      await action();
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // The slides simply show again next time.
      }
      // "returning" is where a later sign-out should land.
      setStep(next);
    } catch (cause) {
      setError(describeAuthError(cause));
    } finally {
      setPending(false);
    }
  }

  if (identity) {
    return step === "ready" ? (
      <ReadyScreen
        address={identity.wallet.account.address}
        onContinue={() => setStep("returning")}
      />
    ) : (
      children
    );
  }
  if (step === "splash") {
    return (
      <main className="grid flex-1 place-items-center">
        <Badge />
      </main>
    );
  }
  if (step === "create") {
    return (
      <CreateScreen
        pending={pending}
        error={error}
        onBack={() => setStep(hasOnboarded() ? "returning" : "slides")}
        onCreate={(name) => run(() => register(name), "ready")}
      />
    );
  }
  return (
    <IntroScreen
      returning={step === "returning"}
      pending={pending}
      error={error}
      onCreate={() => {
        setError(undefined);
        setStep("create");
      }}
      onSignIn={() => run(signIn, "returning")}
    />
  );
}
