"use client";

import { type FormEvent, useState } from "react";

import { describeAuthError } from "@/lib/auth-error.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Field } from "./ui/field.tsx";

type Pending = "register" | "signIn" | null;

export function PasskeyCard() {
  const { identity, register, signIn, signOut } = useIdentity();
  const [name, setName] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string>();

  async function run(kind: Exclude<Pending, null>, action: () => Promise<void>) {
    setPending(kind);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(describeAuthError(cause));
    } finally {
      setPending(null);
    }
  }

  if (identity) {
    const { address } = identity.wallet.account;
    return (
      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-sm text-ink-muted">Your account</p>
          <p className="break-all font-mono text-sm">{address}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(address)}>
            Copy address
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </Card>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    run("register", () => register(name.trim()));
  }

  return (
    <Card>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <Field
          label="Display name"
          placeholder="satoshi"
          autoComplete="nickname"
          maxLength={32}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          hint="Shown on leaderboards and saved with your passkey."
          {...(error ? { error } : {})}
        />
        <Button type="submit" pending={pending === "register"} disabled={pending !== null}>
          Create account with a passkey
        </Button>
        <Button
          variant="ghost"
          pending={pending === "signIn"}
          disabled={pending !== null}
          onClick={() => run("signIn", signIn)}
        >
          I already have one
        </Button>
      </form>
    </Card>
  );
}
