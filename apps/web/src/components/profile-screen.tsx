"use client";

import { useIdentity } from "@/lib/use-identity.tsx";
import { ProfileEditor } from "./profile-editor.tsx";
import { BackButton } from "./ui/back-button.tsx";

export function ProfileScreen() {
  const { identity } = useIdentity();
  if (!identity) {
    return null;
  }
  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <BackButton fallback="/account" />
        <h1 className="text-xl font-bold leading-[26px] tracking-tight">Edit profile</h1>
      </header>
      <ProfileEditor identity={identity} />
    </main>
  );
}
