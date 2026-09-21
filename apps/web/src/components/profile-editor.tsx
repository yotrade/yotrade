"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Identity } from "@yotrade/plugin-mera/plugin";
import { useState } from "react";

import { fundGas } from "@/lib/fund-gas.ts";
import { AVATARS, MAX_NAME_BYTES, parseProfile, publishProfile } from "@/lib/profile.ts";
import { useLocalProfile } from "@/lib/use-local-profile.ts";
import { useMyTournaments } from "@/lib/use-my-tournaments.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Avatar } from "./ui/avatar.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";

const RING = "rounded-full ring-[3px] ring-offset-2 ring-offset-surface transition duration-200";

/** Name and avatar. Kept on this device and written onchain by every tournament account still in play. */
export function ProfileEditor({ identity }: { identity: Identity }) {
  const { publicClient } = useRuntime();
  const queryClient = useQueryClient();
  const { mine } = useMyTournaments();
  const [profile, setProfile] = useLocalProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string }>();
  const { address } = identity.wallet.account;
  const dirty = name.trim() !== profile.name || avatar !== profile.avatar;

  async function save() {
    const next = parseProfile(name, avatar);
    if ("error" in next) {
      setMessage({ tone: "error", text: next.error });
      return;
    }
    setPending(true);
    setMessage(undefined);
    setProfile(next);
    try {
      const open = (mine.data ?? []).filter(
        (item) => item.phase === "upcoming" || item.phase === "live",
      );
      // One at a time: every account pays its own gas, and Monad wants each receipt before the next send.
      for (const item of open) {
        const wallet = identity.tournamentWallet(item.tournament.id);
        await fundGas(publicClient, wallet.account.address);
        await publishProfile(publicClient, wallet, next);
      }
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setMessage({
        tone: "ok",
        text:
          open.length === 0
            ? "Saved. It goes onchain when you join a tournament."
            : "Saved onchain.",
      });
    } catch {
      setMessage({ tone: "error", text: "Saved on this device, but not onchain yet. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Field
        label="Display name"
        placeholder="How the leaderboard calls you"
        value={name}
        maxLength={MAX_NAME_BYTES}
        autoComplete="nickname"
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold tracking-tight">Avatar</legend>
        <div className="grid grid-cols-4 place-items-center gap-y-4">
          {[0, ...AVATARS.map((item) => item.id)].map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === avatar}
              aria-label={id === 0 ? "Default avatar" : `Avatar ${id}`}
              onClick={() => setAvatar(id)}
              className={`${RING} focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent active:scale-95 ${id === avatar ? "ring-accent" : "ring-transparent hover:ring-border"}`}
            >
              <Avatar address={address} size={56} avatar={id} />
            </button>
          ))}
        </div>
      </fieldset>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`text-sm font-medium ${message.tone === "error" ? "text-down" : "text-up"}`}
        >
          {message.text}
        </p>
      ) : null}
      <Button type="submit" pending={pending} disabled={!dirty}>
        Save profile
      </Button>
    </form>
  );
}
