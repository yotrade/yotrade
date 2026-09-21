"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { EMPTY_PROFILE, loadProfile, type Profile, saveProfile } from "./profile.ts";

const KEY = ["local-profile"] as const;

/** The profile kept on this device, shared by every component that shows or edits it. */
export function useLocalProfile(): readonly [Profile, (next: Profile) => void] {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: loadProfile, staleTime: Number.POSITIVE_INFINITY });
  return [
    data ?? EMPTY_PROFILE,
    (next) => {
      saveProfile(next);
      queryClient.setQueryData(KEY, next);
    },
  ];
}
