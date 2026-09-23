"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { LANGUAGES, type LanguageCode } from "@/lib/languages.ts";
import { Icon } from "./ui/icon.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

const CODES = Object.keys(LANGUAGES) as LanguageCode[];
/** Chosen once in Account › Preferences; the same key the account screen writes. */
const STORAGE_KEY = "yotrade.language";

function savedLanguage(): LanguageCode {
  // Preference only, nothing sensitive. Storage can be unavailable in private windows.
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return CODES.find((code) => code === saved) ?? "en";
  } catch {
    return "en";
  }
}

/** Kimi's take on the standings, one quiet paragraph in the language the community speaks. */
export function Commentary({ id }: { id: string }) {
  // Read after mount: the server does not know the preference, and the first paint must match it.
  const [language, setLanguage] = useState<LanguageCode>("en");
  useEffect(() => setLanguage(savedLanguage()), []);

  const { data, isPending } = useQuery({
    queryKey: ["commentary", id, language],
    // `null` means the server has no Kimi key: there is nothing to show.
    queryFn: async (): Promise<string | null> => {
      const response = await fetch(`/api/commentary/${id}?lang=${language}`);
      if (!response.ok) {
        throw new Error(`Commentary answered ${response.status}`);
      }
      return ((await response.json()) as { text: string | null }).text;
    },
    refetchInterval: 60_000,
  });

  if (data === null) {
    return null;
  }
  return (
    <figure className="flex gap-3 px-1">
      <Icon name="magic-wand" size={18} className="mt-0.5 shrink-0 text-accent" />
      <div className="flex min-w-0 flex-col gap-1">
        {isPending ? (
          <Loading label="Kimi is watching the order book" className="flex flex-col gap-2 py-0.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </Loading>
        ) : (
          <blockquote aria-live="polite" className="text-sm font-medium leading-5 text-ink">
            {data ?? "Watching the order book…"}
          </blockquote>
        )}
        <figcaption className="text-[11px] font-semibold text-ink-muted">
          Kimi · {LANGUAGES[language]}
        </figcaption>
      </div>
    </figure>
  );
}
