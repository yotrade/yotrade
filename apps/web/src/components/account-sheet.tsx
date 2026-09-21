"use client";

import { useState } from "react";

import { shortAddress } from "@/lib/format.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { Icon } from "./ui/icon.tsx";
import { Sheet, SheetRow } from "./ui/sheet.tsx";

const EXPLORER = "https://testnet.monadvision.com/address/";

/** Who you are: the account, how it is secured, and the way out. App preferences live in settings. */
export function AccountSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { identity, signOut } = useIdentity();
  const [copied, setCopied] = useState(false);
  if (!identity) {
    return null;
  }
  const { address } = identity.wallet.account;

  return (
    <Sheet open={open} onClose={onClose} label="Account">
      <div className="flex flex-col items-center gap-3 rounded-[32px] bg-surface-raised p-6">
        <Avatar address={address} size={72} />
        <p className="font-mono text-sm font-semibold">{shortAddress(address)}</p>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(address);
            setCopied(true);
          }}
          className="rounded-lg bg-accent-soft px-2 py-1 font-mono text-xs font-bold text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          {copied ? "Copied" : "Copy address"}
        </button>
      </div>

      <div className="flex flex-col divide-y divide-border/60">
        <SheetRow icon={<Icon name="face-scan" size={20} />} label="Secured by">
          Passkey
        </SheetRow>
        <SheetRow icon={<Icon name="credit-card" size={20} />} label="Trading accounts">
          One per tournament
        </SheetRow>
        <a
          href={`${EXPLORER}${address}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <SheetRow icon={<Icon name="external-link" size={20} />} label="View on MonadVision">
            <Icon name="chevron-right" size={16} />
          </SheetRow>
        </a>
      </div>

      <button
        type="button"
        onClick={() => {
          onClose();
          signOut();
        }}
        className="min-h-12 rounded-full bg-down/10 font-mono text-[15px] font-semibold text-down transition duration-200 hover:bg-down/15 focus-visible:outline-2 focus-visible:outline-down active:scale-[0.98]"
      >
        Sign out
      </button>
    </Sheet>
  );
}
