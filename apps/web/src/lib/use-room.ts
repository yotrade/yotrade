"use client";

import { useQuery } from "@tanstack/react-query";

import type { Room } from "./room.ts";

/** The round so far, from `/api/tournaments/[id]/room`. Null before trading starts. */
export function useRoom(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["room", id],
    enabled,
    refetchInterval: 5_000,
    queryFn: async (): Promise<Room | null> => {
      const response = await fetch(`/api/tournaments/${id}/room`);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Room answered ${response.status}`);
      }
      return (await response.json()) as Room;
    },
  });
}
