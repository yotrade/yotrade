"use client";

import { shortAddress } from "@/lib/format.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";

/** The signed-in account as a kit list row. The gate guarantees an identity by the time this renders. */
export function AccountCard() {
  const { identity, signOut } = useIdentity();
  if (!identity) {
    return null;
  }
  const { address } = identity.wallet.account;
  return (
    <Card className="flex items-center gap-3">
      <Avatar address={address} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-semibold leading-tight">Your account</p>
        <p className="truncate font-mono text-[13px] text-ink-muted">{shortAddress(address)}</p>
      </div>
      <Button
        variant="secondary"
        className="min-h-9 w-auto px-3 py-1.5 text-[13px]"
        onClick={() => navigator.clipboard.writeText(address)}
      >
        Copy
      </Button>
      <Button variant="ghost" className="min-h-9 w-auto px-2 py-1.5 text-[13px]" onClick={signOut}>
        Sign out
      </Button>
    </Card>
  );
}
