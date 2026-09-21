"use client";

import { createContext, type ReactNode, use, useCallback, useMemo, useRef, useState } from "react";

import type { Identity } from "@yotrade/plugin-mera/plugin";

import { useRuntime } from "./use-runtime.ts";

interface IdentityState {
  /** `null` until a passkey prompt succeeds. Held in memory only: a reload asks for the passkey again. */
  readonly identity: Identity | null;
  register(displayName: string): Promise<void>;
  signIn(): Promise<void>;
  signOut(): void;
}

const IdentityContext = createContext<IdentityState | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { mera } = useRuntime();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const current = useRef<Identity | null>(null);

  const replace = useCallback((next: Identity | null) => {
    // Wipe the previous entropy and signing sessions before dropping the reference.
    current.current?.end();
    current.current = next;
    setIdentity(next);
  }, []);

  const value = useMemo<IdentityState>(
    () => ({
      identity,
      register: async (displayName) =>
        replace(await mera.register({ name: displayName, displayName })),
      signIn: async () => replace(await mera.signIn()),
      signOut: () => replace(null),
    }),
    [identity, mera, replace],
  );

  return <IdentityContext value={value}>{children}</IdentityContext>;
}

export function useIdentity(): IdentityState {
  const state = use(IdentityContext);
  if (!state) {
    throw new Error("useIdentity must be used inside <Providers>");
  }
  return state;
}
