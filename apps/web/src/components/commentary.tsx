"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { LANGUAGES, type LanguageCode } from "@/lib/languages.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";

const CODES = Object.keys(LANGUAGES) as LanguageCode[];
const STORAGE_KEY = "yotrade.language";

class NotConfiguredError extends Error {}

function initialLanguage(): LanguageCode {
  // Preference only, nothing sensitive. Storage can be unavailable in private windows.
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return CODES.find((code) => code === saved) ?? "en";
  } catch {
    return "en";
  }
}

/** Kimi's take on the standings, in the language the community speaks. */
export function Commentary({ id, name }: { id: string; name: string }) {
  const [language, setLanguage] = useState<LanguageCode>(initialLanguage);
  const [shared, setShared] = useState(false);

  const { data, error } = useQuery({
    queryKey: ["commentary", id, language],
    queryFn: async (): Promise<string> => {
      const response = await fetch(`/api/commentary/${id}?lang=${language}`);
      if (response.status === 503) {
        throw new NotConfiguredError();
      }
      if (!response.ok) {
        throw new Error(`Commentary answered ${response.status}`);
      }
      return ((await response.json()) as { text: string }).text;
    },
    refetchInterval: 30_000,
    retry: (count, cause) => !(cause instanceof NotConfiguredError) && count < 2,
  });

  if (error instanceof NotConfiguredError) {
    return null;
  }

  function choose(next: LanguageCode) {
    setLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice simply does not survive a reload.
    }
  }

  async function share() {
    const payload = { title: name, text: data ?? name, url: window.location.href };
    if (navigator.share) {
      await navigator.share(payload).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(`${payload.text}\n${payload.url}`);
    setShared(true);
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-accent">Live commentary · Kimi</p>
        <select
          aria-label="Commentary language"
          value={language}
          onChange={(event) => choose(event.target.value as LanguageCode)}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          {CODES.map((code) => (
            <option key={code} value={code}>
              {LANGUAGES[code]}
            </option>
          ))}
        </select>
      </div>
      <p aria-live="polite" className={data ? "leading-relaxed" : "text-sm text-ink-muted"}>
        {data ?? (error ? "The commentator is catching their breath…" : "Watching the order book…")}
      </p>
      <Button variant="secondary" className="min-h-10" disabled={!data} onClick={share}>
        {shared ? "Copied, paste it in your group" : "Share with your community"}
      </Button>
    </Card>
  );
}
