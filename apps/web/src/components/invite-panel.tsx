"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fundGas } from "@/lib/fund-gas.ts";
import type { IndexedTournament } from "@/lib/indexer.ts";
import { hostInvite, inviteLink } from "@/lib/invite.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";

/** The host's invite link, and the switch that turns a leaked one off. Only the host ever sees this card. */
export function InvitePanel({ tournament }: { tournament: IndexedTournament }) {
  const { publicClient, tournament: manager } = useRuntime();
  const { identity } = useIdentity();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const signer = useQuery({
    queryKey: ["invite-signer", tournament.id.toString()],
    queryFn: () => manager.inviteSignerOf(tournament.id),
  });

  if (!(identity && identity.wallet.account.address === tournament.organizer && signer.data)) {
    return null;
  }
  if (signer.data === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  const current = hostInvite(identity, tournament.id, signer.data);

  async function rotate() {
    if (!(identity && current)) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await fundGas(publicClient, identity.wallet.account.address);
      const next = identity.inviteKey(tournament.id, current.epoch + 1);
      await manager.setInvite(identity.wallet, tournament.id, next.address);
      await queryClient.invalidateQueries({ queryKey: ["invite-signer"] });
      setCopied(false);
    } catch {
      setError("The code was not changed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 py-4">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Icon name="face-scan" size={20} />
        Private · invite link
      </p>
      {current ? (
        <>
          <p className="text-sm font-medium leading-5 text-ink-muted">
            Only people with this link can join. It comes from your passkey, so you can share it
            again from any device. If a chat app cuts the link short, send the code on its own: the
            page has a place to paste it. If it leaks, make a new one: old links stop working at
            once.
          </p>
          <Button
            variant="secondary"
            className="min-h-10"
            onClick={async () => {
              const link = inviteLink(window.location.origin, tournament.id, current.code);
              if (navigator.share) {
                await navigator
                  .share({ title: "Join my tournament", url: link })
                  .catch(() => undefined);
                return;
              }
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? "Link copied" : "Share invite link"}
          </Button>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(current.code);
              setCopiedCode(true);
            }}
            className="font-mono text-[13px] font-semibold text-accent transition duration-200 hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
          >
            {copiedCode ? "Code copied" : "Copy just the code"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={rotate}
            className="font-mono text-[13px] font-semibold text-down transition duration-200 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-down disabled:opacity-50"
          >
            {pending ? "Changing the code…" : "Make a new link and revoke the old one"}
          </button>
        </>
      ) : (
        <p className="text-sm font-medium leading-5 text-ink-muted">
          The invite for this tournament was not made by this passkey, so it cannot be shown here.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
