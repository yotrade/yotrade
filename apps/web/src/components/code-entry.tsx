"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { roomId } from "@/lib/room-code.ts";
import { Button } from "./ui/button.tsx";

/** The one thing a player needs to know: type the code on the screen, and you are in the room. */
export function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const clean = code
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 6);

  function submit(event: FormEvent) {
    event.preventDefault();
    const id = roomId(clean);
    if (id === null) {
      setError("That code does not match any game. Check it on the host's screen.");
      return;
    }
    setPending(true);
    router.push(`/t/${id}` as Route);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-[28px] bg-accent p-5 text-accent-ink shadow-button"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold leading-[26px] tracking-tight">Join a game</h2>
        <p className="text-sm font-medium opacity-80">Enter the code from the host's screen.</p>
      </div>
      <label className="sr-only" htmlFor="game-code">
        Game code
      </label>
      <input
        id="game-code"
        value={clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean}
        onChange={(event) => {
          setCode(event.target.value);
          setError(undefined);
        }}
        placeholder="ABC 123"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "game-code-error" : undefined}
        className="tabular h-16 w-full rounded-2xl bg-white text-center font-mono text-[32px] font-bold tracking-[0.2em] text-ink placeholder:text-ink/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
      />
      {error ? (
        <p id="game-code-error" role="alert" className="text-sm font-semibold">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        pending={pending}
        disabled={clean.length !== 6}
        className="border-ink bg-ink text-white hover:bg-ink/90"
      >
        Enter
      </Button>
    </form>
  );
}
